import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runAgent } from "../agent/runner";
import { discoverTasks } from "./discover-tasks";
import type { LeaderboardEntry, SuiteLeaderboard, SuiteResult, SuiteSummary } from "./types";

const repoRoot = resolve(import.meta.dir, "../..");

export async function runSuite(agentId: string, tasksPattern: string): Promise<SuiteResult> {
  const taskPaths = await discoverTasks(tasksPattern);
  if (taskPaths.length === 0) {
    throw new Error(`no valid tasks discovered for pattern: ${tasksPattern}`);
  }

  const startedAt = new Date().toISOString();
  const suiteStartedMs = Date.now();
  const entries: LeaderboardEntry[] = [];

  for (const taskPath of taskPaths) {
    console.log(`\n[suite] running ${taskPath} with ${agentId}`);
    const result = await runAgent(taskPath, agentId);

    entries.push({
      task_id: result.task_id,
      score: result.score,
      duration_ms: result.durations.total_ms,
      status: result.status,
      run_id: result.run_id,
    });

    console.log(
      `[suite] ${result.task_id}: ${result.status} (${result.score}/${result.max_score}, ${result.durations.total_ms}ms)`,
    );
  }

  const completedAt = new Date().toISOString();
  const passed = entries.filter((entry) => entry.status === "completed").length;
  const failed = entries.length - passed;
  const averageScore = entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length;

  const summary: SuiteSummary = {
    agent_id: agentId,
    total_tasks: entries.length,
    passed,
    failed,
    average_score: roundScore(averageScore),
    total_wall_time_ms: Date.now() - suiteStartedMs,
    started_at: startedAt,
    completed_at: completedAt,
  };

  const leaderboard: SuiteLeaderboard = {
    agent_id: agentId,
    entries: [...entries].sort((left, right) => right.score - left.score || left.task_id.localeCompare(right.task_id)),
  };

  const outputDir = join(repoRoot, "results", agentId);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(outputDir, "leaderboard.json"), `${JSON.stringify(leaderboard, null, 2)}\n`);

  return { summary, leaderboard, outputDir };
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}
