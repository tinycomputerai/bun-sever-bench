import { CodexCliAgent } from "./codex-cli";

/**
 * GPT-5 agent. Evaluated through the OpenAI Codex CLI harness with the model
 * pinned to `gpt-5`, so it shares the Codex adapter's workspace execution,
 * timeout handling, log capture, and token-usage parsing while reporting its own
 * agent id in result.json.
 */
export class Gpt5Agent extends CodexCliAgent {
  constructor() {
    super({ id: "gpt-5", model: "gpt-5" });
  }
}
