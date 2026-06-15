#!/usr/bin/env bun

import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";

type JsonSchema = {
  $ref?: string;
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  patternProperties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  $defs?: Record<string, JsonSchema>;
};

export type ValidationResult = {
  taskDir: string;
  taskId?: string;
  errors: string[];
};

type ValidationContext = {
  taskDir: string;
  errors: string[];
};

const repoRoot = resolve(import.meta.dir, "..");
const schemaPath = resolve(repoRoot, "schemas/task.schema.json");
const schema = (await Bun.file(schemaPath).json()) as JsonSchema;

export async function validateTaskDirectory(taskDirInput: string): Promise<ValidationResult> {
  const taskDir = resolve(process.cwd(), taskDirInput);
  const errors: string[] = [];
  const ctx: ValidationContext = { taskDir, errors };

  if (!existsSync(taskDir)) {
    return { taskDir, errors: [`${taskDirInput}: task directory does not exist`] };
  }
  if (!statSync(taskDir).isDirectory()) {
    return { taskDir, errors: [`${taskDirInput}: path is not a directory`] };
  }

  const taskYamlPath = resolve(taskDir, "task.yaml");
  if (!existsSync(taskYamlPath)) {
    return { taskDir, errors: ["task.yaml: missing required task file"] };
  }

  let task: unknown;
  try {
    task = Bun.YAML.parse(await Bun.file(taskYamlPath).text());
  } catch (error) {
    return {
      taskDir,
      errors: [`task.yaml: failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  errors.push(...validateSchema(task, schema, "$", schema));

  const taskRecord = isRecord(task) ? task : {};
  const taskId = typeof taskRecord.id === "string" ? taskRecord.id : undefined;

  validateLayout(ctx);
  validateTaskIdMatchesDirectory(ctx, taskId);
  validateTagsIncludeCategory(ctx, taskRecord);
  validateDatasetPolicy(ctx, taskRecord);
  validateReferencedFiles(ctx, taskRecord);
  validateTestWeights(ctx, taskRecord);
  validateScoringWeights(ctx, taskRecord);
  validateGeneratedProvenance(ctx, taskRecord);

  return { taskDir, taskId, errors };
}

function validateLayout(ctx: ValidationContext): void {
  const requiredFiles = [
    "task.yaml",
    "prompt.md",
    "package.json",
    "src/README.md",
  ];
  const requiredDirs = [
    "src",
    "tests",
    "tests/public",
    "tests/hidden",
    "tests/metamorphic",
    "tests/helpers",
    "fixtures",
    "runner",
    "validators",
    "solutions",
    "solutions/reference",
  ];

  for (const file of requiredFiles) {
    const path = resolve(ctx.taskDir, file);
    if (!existsSync(path) || !statSync(path).isFile()) {
      ctx.errors.push(`${file}: missing required file`);
    }
  }

  const hasModernLock = existsSync(resolve(ctx.taskDir, "bun.lock"));
  const hasLegacyLock = existsSync(resolve(ctx.taskDir, "bun.lockb"));
  if (!hasModernLock && !hasLegacyLock) {
    ctx.errors.push("bun.lock or bun.lockb: missing required Bun lockfile");
  }

  for (const dir of requiredDirs) {
    const path = resolve(ctx.taskDir, dir);
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      ctx.errors.push(`${dir}: missing required directory`);
    }
  }
}

function validateTaskIdMatchesDirectory(ctx: ValidationContext, taskId?: string): void {
  if (!taskId) {
    return;
  }

  if (basename(ctx.taskDir) !== taskId) {
    ctx.errors.push(`id: task id "${taskId}" must match directory name "${basename(ctx.taskDir)}"`);
  }
}

function validateTagsIncludeCategory(ctx: ValidationContext, task: Record<string, unknown>): void {
  if (typeof task.category !== "string" || !Array.isArray(task.tags)) {
    return;
  }

  if (!task.tags.includes(task.category)) {
    ctx.errors.push(`tags: must include primary category "${task.category}"`);
  }
}

function validateDatasetPolicy(ctx: ValidationContext, task: Record<string, unknown>): void {
  const dataset = asRecord(task.dataset);
  if (!dataset) {
    return;
  }

  if (dataset.split === "private_eval" && dataset.trainable !== false) {
    ctx.errors.push("dataset.trainable: private_eval tasks must have trainable: false");
  }
}

function validateReferencedFiles(ctx: ValidationContext, task: Record<string, unknown>): void {
  const instruction = asRecord(task.instruction);
  if (instruction && typeof instruction.prompt_file === "string") {
    assertExistingFile(ctx, "instruction.prompt_file", instruction.prompt_file);
  }

  const tests = asRecord(task.tests);
  if (tests) {
    for (const suiteName of ["public", "hidden", "metamorphic", "generated"]) {
      const suite = asRecord(tests[suiteName]);
      if (!suite || !Array.isArray(suite.files)) {
        continue;
      }

      suite.files.forEach((file, index) => {
        if (typeof file === "string") {
          assertExistingFile(ctx, `tests.${suiteName}.files[${index}]`, file);
        }
      });
    }
  }

  const referenceSolution = asRecord(task.reference_solution);
  if (referenceSolution && typeof referenceSolution.path === "string") {
    assertExistingDirectory(ctx, "reference_solution.path", referenceSolution.path);
  }
}

function validateTestWeights(ctx: ValidationContext, task: Record<string, unknown>): void {
  const tests = asRecord(task.tests);
  if (!tests) {
    return;
  }

  const weights: number[] = [];
  for (const suiteName of ["public", "hidden", "metamorphic", "generated"]) {
    const suite = asRecord(tests[suiteName]);
    if (suite && typeof suite.weight === "number") {
      weights.push(suite.weight);
    }
  }

  if (weights.length === 0) {
    return;
  }

  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (!almostEqual(sum, 1)) {
    ctx.errors.push(`tests: suite weights must sum to 1.0, got ${formatNumber(sum)}`);
  }
}

function validateScoringWeights(ctx: ValidationContext, task: Record<string, unknown>): void {
  const scoring = asRecord(task.scoring);
  const weights = asRecord(scoring?.weights);
  if (!weights) {
    return;
  }

  const values = Object.values(weights).filter((value): value is number => typeof value === "number");
  if (values.length === 0) {
    return;
  }

  const sum = values.reduce((total, weight) => total + weight, 0);
  if (!almostEqual(sum, 1)) {
    ctx.errors.push(`scoring.weights: weights must sum to 1.0, got ${formatNumber(sum)}`);
  }
}

function validateGeneratedProvenance(ctx: ValidationContext, task: Record<string, unknown>): void {
  const provenance = asRecord(task.provenance);
  if (!provenance || provenance.source !== "generated") {
    return;
  }

  if (!isRecord(provenance.generator)) {
    ctx.errors.push("provenance.generator: generated tasks must include generator metadata");
  }
}

function assertExistingFile(ctx: ValidationContext, field: string, relativePath: string): void {
  const path = resolveTaskPath(ctx, field, relativePath);
  if (!path) {
    return;
  }

  if (!existsSync(path) || !statSync(path).isFile()) {
    ctx.errors.push(`${field}: referenced file does not exist: ${relativePath}`);
  }
}

function assertExistingDirectory(ctx: ValidationContext, field: string, relativePath: string): void {
  const path = resolveTaskPath(ctx, field, relativePath);
  if (!path) {
    return;
  }

  if (!existsSync(path) || !statSync(path).isDirectory()) {
    ctx.errors.push(`${field}: referenced directory does not exist: ${relativePath}`);
  }
}

function resolveTaskPath(ctx: ValidationContext, field: string, path: string): string | undefined {
  if (isAbsolute(path)) {
    ctx.errors.push(`${field}: path must be relative: ${path}`);
    return undefined;
  }

  const resolved = resolve(ctx.taskDir, path);
  const fromTaskRoot = relative(ctx.taskDir, resolved);
  if (fromTaskRoot.startsWith("..") || isAbsolute(fromTaskRoot)) {
    ctx.errors.push(`${field}: path escapes task directory: ${path}`);
    return undefined;
  }

  return resolved;
}

function validateSchema(value: unknown, currentSchema: JsonSchema, path: string, rootSchema: JsonSchema): string[] {
  if (currentSchema.$ref) {
    return validateSchema(value, resolveRef(rootSchema, currentSchema.$ref), path, rootSchema);
  }

  const errors: string[] = [];

  if (currentSchema.const !== undefined && value !== currentSchema.const) {
    errors.push(`${path}: expected constant ${JSON.stringify(currentSchema.const)}`);
    return errors;
  }

  if (currentSchema.enum && !currentSchema.enum.some((candidate) => candidate === value)) {
    errors.push(`${path}: expected one of ${currentSchema.enum.map((item) => JSON.stringify(item)).join(", ")}`);
    return errors;
  }

  if (currentSchema.type && !matchesType(value, currentSchema.type)) {
    errors.push(`${path}: expected type ${Array.isArray(currentSchema.type) ? currentSchema.type.join(" or ") : currentSchema.type}`);
    return errors;
  }

  if (typeof value === "string") {
    if (currentSchema.minLength !== undefined && value.length < currentSchema.minLength) {
      errors.push(`${path}: expected length >= ${currentSchema.minLength}`);
    }
    if (currentSchema.maxLength !== undefined && value.length > currentSchema.maxLength) {
      errors.push(`${path}: expected length <= ${currentSchema.maxLength}`);
    }
    if (currentSchema.pattern && !new RegExp(currentSchema.pattern).test(value)) {
      errors.push(`${path}: does not match pattern ${currentSchema.pattern}`);
    }
  }

  if (typeof value === "number") {
    if (currentSchema.minimum !== undefined && value < currentSchema.minimum) {
      errors.push(`${path}: expected value >= ${currentSchema.minimum}`);
    }
    if (currentSchema.maximum !== undefined && value > currentSchema.maximum) {
      errors.push(`${path}: expected value <= ${currentSchema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (currentSchema.minItems !== undefined && value.length < currentSchema.minItems) {
      errors.push(`${path}: expected at least ${currentSchema.minItems} item(s)`);
    }
    if (currentSchema.maxItems !== undefined && value.length > currentSchema.maxItems) {
      errors.push(`${path}: expected at most ${currentSchema.maxItems} item(s)`);
    }
    if (currentSchema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      errors.push(`${path}: expected unique items`);
    }
    if (currentSchema.items) {
      value.forEach((item, index) => {
        errors.push(...validateSchema(item, currentSchema.items!, `${path}[${index}]`, rootSchema));
      });
    }
  }

  if (isRecord(value)) {
    const properties = currentSchema.properties ?? {};
    const patternProperties = currentSchema.patternProperties ?? {};

    for (const requiredKey of currentSchema.required ?? []) {
      if (!(requiredKey in value)) {
        errors.push(`${path}.${requiredKey}: missing required property`);
      }
    }

    for (const [key, childValue] of Object.entries(value)) {
      const propertySchema = properties[key];
      if (propertySchema) {
        errors.push(...validateSchema(childValue, propertySchema, `${path}.${key}`, rootSchema));
        continue;
      }

      const matchedPatternSchemas = Object.entries(patternProperties)
        .filter(([pattern]) => new RegExp(pattern).test(key))
        .map(([, schema]) => schema);

      if (matchedPatternSchemas.length > 0) {
        for (const patternSchema of matchedPatternSchemas) {
          errors.push(...validateSchema(childValue, patternSchema, `${path}.${key}`, rootSchema));
        }
        continue;
      }

      if (currentSchema.additionalProperties === false) {
        errors.push(`${path}.${key}: unknown property`);
      } else if (isRecord(currentSchema.additionalProperties)) {
        errors.push(...validateSchema(childValue, currentSchema.additionalProperties, `${path}.${key}`, rootSchema));
      }
    }
  }

  return errors;
}

function resolveRef(rootSchema: JsonSchema, ref: string): JsonSchema {
  if (!ref.startsWith("#/")) {
    throw new Error(`Unsupported schema ref: ${ref}`);
  }

  const parts = ref.slice(2).split("/").map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = rootSchema;

  for (const part of parts) {
    if (!isRecord(current) || !(part in current)) {
      throw new Error(`Unresolvable schema ref: ${ref}`);
    }
    current = current[part];
  }

  if (!isRecord(current)) {
    throw new Error(`Schema ref did not resolve to an object: ${ref}`);
  }

  return current as JsonSchema;
}

function matchesType(value: unknown, expectedType: string | string[]): boolean {
  const expectedTypes = Array.isArray(expectedType) ? expectedType : [expectedType];
  return expectedTypes.some((type) => {
    switch (type) {
      case "array":
        return Array.isArray(value);
      case "boolean":
        return typeof value === "boolean";
      case "integer":
        return typeof value === "number" && Number.isInteger(value);
      case "null":
        return value === null;
      case "number":
        return typeof value === "number" && Number.isFinite(value);
      case "object":
        return isRecord(value);
      case "string":
        return typeof value === "string";
      default:
        throw new Error(`Unsupported schema type: ${type}`);
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function almostEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-9;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

function printResult(result: ValidationResult): void {
  const label = result.taskId ?? result.taskDir;
  if (result.errors.length === 0) {
    console.log(`valid task: ${label}`);
    return;
  }

  console.error(`invalid task: ${label}`);
  for (const error of result.errors) {
    console.error(`  - ${error}`);
  }
}

if (import.meta.main) {
  const taskDir = Bun.argv[2];
  if (!taskDir) {
    console.error("usage: bun run validate:task <task-dir>");
    process.exit(2);
  }

  const result = await validateTaskDirectory(taskDir);
  printResult(result);
  process.exit(result.errors.length === 0 ? 0 : 1);
}
