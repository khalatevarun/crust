import { homedir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ProviderId } from "commons";
import { envHasAny, isRecord, readJsonRecord } from "./localAuth";
import type { AgentEvent, Provider, ProviderRunOptions } from "./Provider";

export function claudeIsConfigured(
    env: NodeJS.Dict<string> = process.env,
    home: string = homedir(),
): boolean {
    if (envHasAny(env, ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN"])) {
        return true;
    }
    const login = readJsonRecord(join(home, ".claude.json"));
    return isRecord(login?.oauthAccount);
}

export class ClaudeProvider implements Provider {
    readonly id: ProviderId = "claude";

    isConfigured(): boolean {
        return claudeIsConfigured();
    }

    setupHint(): string {
        return "claude is not configured. Run `claude` in a terminal and finish /login, or set ANTHROPIC_API_KEY in apps/backend/.env and restart the backend.";
    }

    async *run(options: ProviderRunOptions): AsyncGenerator<AgentEvent> {
        for await (const message of query({
            prompt: options.prompt,
            options: {
                cwd: options.cwd,
                allowedTools: ["Read", "Edit", "Glob"],
                permissionMode: "acceptEdits",
                resume: options.resume,
                model: options.model,
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
