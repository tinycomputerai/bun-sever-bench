import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { FORBIDDEN_EXPORT_SEGMENTS, SOLUTION_FILES, SOLUTION_ROOTS } from "./constants";
import type { SolutionPatch } from "./types";

type FileSnapshot = Map<string, string>;

export function extractSolutionPatch(taskDir: string, workspaceDir: string): SolutionPatch | null {
  const starterFiles = collectSolutionFiles(taskDir, "starter");
  const workspaceFiles = collectSolutionFiles(workspaceDir, "workspace");

  const changedPaths = new Set<string>();
  for (const path of new Set([...starterFiles.keys(), ...workspaceFiles.keys()])) {
    if (starterFiles.get(path) !== workspaceFiles.get(path)) {
      changedPaths.add(path);
    }
  }

  if (changedPaths.size === 0) {
    return null;
  }

  const filesChanged = [...changedPaths].sort();
  if (filesChanged.some((path) => containsForbiddenSegment(path))) {
    throw new Error("solution patch includes forbidden paths");
  }

  const patchParts: string[] = [];
  for (const path of filesChanged) {
    patchParts.push(
      unifiedDiff(
        path,
        starterFiles.get(path) ?? "",
        workspaceFiles.get(path) ?? "",
      ),
    );
  }

  return {
    patch: `${patchParts.join("\n")}\n`,
    files_changed: filesChanged,
  };
}

export function matchesReferenceSolution(taskDir: string, workspaceDir: string): boolean {
  const referenceDir = join(taskDir, "solutions", "reference");
  if (!existsSync(referenceDir)) {
    return false;
  }

  const referenceFiles = collectSolutionFiles(referenceDir, "reference");
  const workspaceFiles = collectSolutionFiles(workspaceDir, "workspace");

  if (referenceFiles.size === 0) {
    return false;
  }

  for (const [path, referenceContent] of referenceFiles) {
    if (workspaceFiles.get(path) !== referenceContent) {
      return false;
    }
  }

  for (const path of workspaceFiles.keys()) {
    if (!referenceFiles.has(path)) {
      return false;
    }
  }

  return true;
}

function collectSolutionFiles(rootDir: string, label: string): FileSnapshot {
  const files: FileSnapshot = new Map();

  for (const relativeRoot of SOLUTION_ROOTS) {
    const absoluteRoot = join(rootDir, relativeRoot);
    if (!existsSync(absoluteRoot)) {
      continue;
    }
    collectDirectoryFiles(absoluteRoot, relativeRoot, files);
  }

  for (const relativeFile of SOLUTION_FILES) {
    const absoluteFile = join(rootDir, relativeFile);
    if (!existsSync(absoluteFile)) {
      continue;
    }
    files.set(relativeFile, readTextFile(absoluteFile));
  }

  if (files.size === 0 && label === "starter") {
    throw new Error(`no starter solution files found under ${rootDir}`);
  }

  return files;
}

function collectDirectoryFiles(absoluteRoot: string, relativeRoot: string, files: FileSnapshot): void {
  for (const entry of walkDirectory(absoluteRoot)) {
    const relativePath = relative(absoluteRoot, entry).replace(/\\/g, "/");
    const normalizedPath = `${relativeRoot}/${relativePath}`.replace(/\/+/g, "/");
    files.set(normalizedPath, readTextFile(entry));
  }
}

function walkDirectory(rootDir: string): string[] {
  const entries: string[] = [];

  for (const entry of readdirSync(rootDir)) {
    const absolutePath = join(rootDir, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      entries.push(...walkDirectory(absolutePath));
      continue;
    }
    if (stats.isFile()) {
      entries.push(absolutePath);
    }
  }

  return entries;
}

function readTextFile(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function containsForbiddenSegment(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return FORBIDDEN_EXPORT_SEGMENTS.some((segment) => normalized.includes(segment));
}

function unifiedDiff(path: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.length > 0 ? oldContent.split("\n") : [];
  const newLines = newContent.length > 0 ? newContent.split("\n") : [];

  if (oldLines.at(-1) === "") {
    oldLines.pop();
  }
  if (newLines.at(-1) === "") {
    newLines.pop();
  }

  const header = [`--- a/${path}`, `+++ b/${path}`];
  if (oldLines.length === 0 && newLines.length === 0) {
    return header.join("\n");
  }

  if (oldLines.join("\n") === newLines.join("\n")) {
    return header.join("\n");
  }

  const chunks = buildDiffChunks(oldLines, newLines);
  const body = chunks.map((chunk) => formatChunk(chunk, oldLines, newLines)).join("\n");
  return `${header.join("\n")}\n${body}`;
}

type DiffChunk = {
  oldStart: number;
  newStart: number;
  lines: string[];
};

function buildDiffChunks(oldLines: string[], newLines: string[]): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  let index = 0;

  while (index < Math.max(oldLines.length, newLines.length)) {
    while (
      index < oldLines.length &&
      index < newLines.length &&
      oldLines[index] === newLines[index]
    ) {
      index += 1;
    }

    if (index >= oldLines.length && index >= newLines.length) {
      break;
    }

    const oldStart = index;
    const newStart = index;
    const lines: string[] = [];
    let oldIndex = index;
    let newIndex = index;

    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      const oldLine = oldLines[oldIndex];
      const newLine = newLines[newIndex];

      if (oldIndex < oldLines.length && newIndex < newLines.length && oldLine === newLine) {
        break;
      }

      if (
        oldIndex < oldLines.length &&
        newIndex < newLines.length &&
        oldLine !== newLine &&
        oldLines[oldIndex + 1] === newLine
      ) {
        lines.push(`-${oldLine}`);
        oldIndex += 1;
        continue;
      }

      if (
        oldIndex < oldLines.length &&
        newIndex < newLines.length &&
        oldLine !== newLine &&
        oldLine === newLines[newIndex + 1]
      ) {
        lines.push(`+${newLine}`);
        newIndex += 1;
        continue;
      }

      if (oldIndex < oldLines.length && (newIndex >= newLines.length || oldLine !== newLine)) {
        lines.push(`-${oldLine}`);
        oldIndex += 1;
        continue;
      }

      if (newIndex < newLines.length) {
        lines.push(`+${newLine}`);
        newIndex += 1;
        continue;
      }

      break;
    }

    chunks.push({ oldStart: oldStart + 1, newStart: newStart + 1, lines });
    index = Math.max(oldIndex, newIndex);
  }

  return chunks;
}

function formatChunk(chunk: DiffChunk, oldLines: string[], newLines: string[]): string {
  const oldCount = chunk.lines.filter((line) => line.startsWith("-") || line.startsWith(" ")).length;
  const newCount = chunk.lines.filter((line) => line.startsWith("+") || line.startsWith(" ")).length;
  const hunkHeader = `@@ -${chunk.oldStart},${Math.max(oldCount, 1)} +${chunk.newStart},${Math.max(newCount, 1)} @@`;
  return `${hunkHeader}\n${chunk.lines.join("\n")}`;
}
