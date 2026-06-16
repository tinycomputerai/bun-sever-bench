import { ClaudeCodeAgent } from "./claude-code";
import { CodexCliAgent } from "./codex-cli";
import { Gpt5Agent } from "./gpt-5";
import type { Agent } from "./types";

const AGENTS: Record<string, () => Agent> = {
  "claude-code": () => new ClaudeCodeAgent(),
  "codex-cli": () => new CodexCliAgent({ id: "codex-cli" }),
  "gpt-5": () => new Gpt5Agent(),
};

export const SUPPORTED_AGENTS = Object.keys(AGENTS);

export function createAgent(agentId: string): Agent {
  const factory = AGENTS[agentId];
  if (!factory) {
    throw new Error(
      `unknown agent: ${agentId}; supported agents: ${SUPPORTED_AGENTS.join(", ")}`,
    );
  }
  return factory();
}
