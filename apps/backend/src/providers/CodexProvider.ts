import { homedir } from "node:os";
import { join } from "node:path";
import { Codex } from "@openai/codex-sdk";
import type { ProviderId } from "commons";
import { envHasAny, readJsonRecord } from "./localAuth";
import type { AgentEvent, Provider, ProviderRunOptions } from "./Provider";

export function codexIsConfigured(
    env: NodeJS.Dict<string> = process.env,
    home: string = homedir(),
): boolean {
    if (envHasAny(env, ["OPENAI_API_KEY"])) return true;
    const codexHome = env.CODEX_HOME ?? join(home, ".codex");
    return readJsonRecord(join(codexHome, "auth.json")) !== null;
}

export class CodexProvider implements Provider {
    readonly id: ProviderId = "codex";

    isConfigured(): boolean {
        return codexIsConfigured();
    }

    setupHint(): string {
        return "codex is not configured. Run `codex login` in a terminal, or set OPENAI_API_KEY in apps/backend/.env and restart the backend.";
    }

    async *run(options: ProviderRunOptions): AsyncGenerator<AgentEvent> {
        const apiKey = process.env.OPENAI_API_KEY;
        const codex = new Codex(apiKey ? { apiKey } : {});
        const thread = options.resume
            ? codex.resumeThread(options.resume, threadOptions(options))
            : codex.startThread(threadOptions(options));

        const { events } = await thread.runStreamed(options.prompt);
        let lastText: string | undefined;
        let ok = true;
        let errorMessage: string | undefined;
        const seen = new Set<string>();

        for await (const event of events) {
            if (event.type === "item.started" || event.type === "item.completed") {
                const tool = toolCallFromCodexItem(event.item);
                if (tool) {
                    const key = tool.id ?? tool.name;
                    if (!seen.has(key)) {
                        seen.add(key);
                        yield tool;
                    }
                }
                if (event.type === "item.completed" && event.item.type === "agent_message") {
                    lastText = event.item.text;
                }
            } else if (event.type === "turn.failed") {
                ok = false;
                errorMessage = event.error.message;
            } else if (event.type === "error") {
                ok = false;
                errorMessage = event.message;
            }
        }

        yield {
            type: "done",
            ok,
            result: lastText,
            providerSessionId: thread.id ?? undefined,
            errorMessage,
        };
    }
}

function threadOptions(options: ProviderRunOptions): {
    workingDirectory: string;
    skipGitRepoCheck: boolean;
    sandboxMode: "workspace-write";
    approvalPolicy: "never";
    model: string;
} {
    return {
        workingDirectory: options.cwd,
        skipGitRepoCheck: true,
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        model: options.model,
    };
}

function toolCallFromCodexItem(item: {
    id: string;
    type: string;
    command?: string;
    changes?: unknown;
    tool?: string;
    arguments?: unknown;
    query?: string;
}): Extract<AgentEvent, { type: "tool-call" }> | undefined {
    if (item.type === "command_execution") {
        return { type: "tool-call", id: item.id, name: "command_execution", input: { command: item.command } };
    }
    if (item.type === "file_change") {
        return { type: "tool-call", id: item.id, name: "file_change", input: { changes: item.changes } };
    }
    if (item.type === "mcp_tool_call" && typeof item.tool === "string") {
        return { type: "tool-call", id: item.id, name: item.tool, input: item.arguments };
    }
    if (item.type === "web_search") {
        return { type: "tool-call", id: item.id, name: "web_search", input: { query: item.query } };
    }
    return undefined;
}

export const codexProvider = new CodexProvider();
