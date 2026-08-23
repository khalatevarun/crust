import { Codex } from "@openai/codex-sdk";
import type { ProviderId } from "commons";
import type { AgentEvent, Provider, ProviderRunOptions } from "./Provider";

export class CodexProvider implements Provider {
    readonly id: ProviderId = "codex";

    isConfigured(): boolean {
        return Boolean(process.env.OPENAI_API_KEY);
    }

    async *run(options: ProviderRunOptions): AsyncGenerator<AgentEvent> {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            yield { type: "done", ok: false, errorMessage: "missing OPENAI_API_KEY" };
            return;
        }
        const codex = new Codex({ apiKey });
        const thread = options.resume
            ? codex.resumeThread(options.resume, threadOptions(options))
            : codex.startThread(threadOptions(options));

        const { events } = await thread.runStreamed(options.prompt);
        let lastText: string | undefined;
        let ok = true;
        let errorMessage: string | undefined;

        for await (const event of events) {
            if (event.type === "item.completed" && event.item.type === "command_execution") {
                yield { type: "tool-call", id: event.item.id, name: "command_execution", input: { command: event.item.command } };
            } else if (event.type === "item.completed" && event.item.type === "file_change") {
                yield { type: "tool-call", id: event.item.id, name: "file_change", input: { changes: event.item.changes } };
            } else if (event.type === "item.completed" && event.item.type === "mcp_tool_call") {
                yield { type: "tool-call", id: event.item.id, name: event.item.tool, input: event.item.arguments };
            } else if (event.type === "item.completed" && event.item.type === "agent_message") {
                lastText = event.item.text;
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

export const codexProvider = new CodexProvider();
