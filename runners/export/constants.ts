export const SFT_SYSTEM_PROMPT =
  "You are a Bun backend specialist. Implement production-quality backend services using Bun.serve, Bun's native APIs, and SQLite when needed. Follow each task specification exactly: honor HTTP semantics, validation rules, concurrency constraints, and error response shapes. Output only the code changes required to satisfy the task.";

export const SOLUTION_ROOTS = ["src"] as const;

export const SOLUTION_FILES = ["package.json"] as const;

export const FORBIDDEN_EXPORT_SEGMENTS = [
  "tests/hidden",
  "tests\\hidden",
  "solutions/reference",
  "solutions\\reference",
] as const;
