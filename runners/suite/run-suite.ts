#!/usr/bin/env bun

import { SUPPORTED_AGENTS } from "../../agents/registry";
import { runSuite } from "./suite";

function parseArgs(argv: string[]): { agentId: string; tasksPattern: string } {
  const args = argv.filter((arg) => arg !== "--");
  let agentId: string | undefined;
  let tasksPattern: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--agent") {
      agentId = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--tasks") {
      tasksPattern = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(
      `usage: bun run run:suite --agent <agent-id> --tasks <task-pattern>\n\nexample: bun run run:suite --agent claude-code --tasks 'tasks/**'\n\nsupported agents: ${SUPPORTED_AGENTS.join(", ")}`,
    );
  }

  if (!agentId || !tasksPattern) {
    throw new Error(
      `usage: bun run run:suite --agent <agent-id> --tasks <task-pattern>\n\nexample: bun run run:suite --agent claude-code --tasks 'tasks/**'\n\nsupported agents: ${SUPPORTED_AGENTS.join(", ")}`,
    );
  }

  if (!SUPPORTED_AGENTS.includes(agentId)) {
    throw new Error(
      `unknown agent: ${agentId}; supported agents: ${SUPPORTED_AGENTS.join(", ")}`,
    );
  }

  return { agentId, tasksPattern };
}

async function main(): Promise<void> {
  const { agentId, tasksPattern } = parseArgs(process.argv.slice(2));
  const result = await runSuite(agentId, tasksPattern);

  console.log(`\n[suite] complete`);
  console.log(`agent: ${result.summary.agent_id}`);
  console.log(`tasks: ${result.summary.total_tasks}`);
  console.log(`passed: ${result.summary.passed}`);
  console.log(`failed: ${result.summary.failed}`);
  console.log(`average score: ${result.summary.average_score}`);
  console.log(`total wall time: ${result.summary.total_wall_time_ms}ms`);
  console.log(`summary: results/${agentId}/summary.json`);
  console.log(`leaderboard: results/${agentId}/leaderboard.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
