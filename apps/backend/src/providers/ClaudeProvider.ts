import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ProviderId } from "commons";
import type { AgentEvent, Provider, ProviderRunOptions } from "./Provider";

export class ClaudeProvider implements Provider {
    readonly id: ProviderId = "claude";

    isConfigured(): boolean {
        return Boolean(process.env.ANTHROPIC_API_KEY);
    }

    async *run(options: ProviderRunOptions): AsyncGenerator<AgentEvent> {
        for await (const message of query({
            prompt: options.prompt,
            options: {
                cwd: options.cwd,
                allowedTools: ["Read", "Edit", "Glob"],
                permissionMode: "acceptEdits",
                resume: options.resume,
            },
        })) {
            if (message.type === "assistant" && message.message?.content) {
                for (const block of message.message.content) {
                    if ("name" in block) {
                        yield {
                            type: "tool-call",
                            id: "id" in block && typeof block.id === "string" ? block.id : undefined,
                            name: block.name,
                            input: "input" in block ? block.input : undefined,
                        };
                    }
                }
            } else if (message.type === "result") {
                const ok = message.subtype === "success";
                yield {
                    type: "done",
                    ok,
                    providerSessionId: message.session_id,
                    result: ok ? message.result : undefined,
                    errorMessage: ok ? undefined : message.subtype,
                };
            }
        }
    }
}

export const claudeProvider = new ClaudeProvider();
