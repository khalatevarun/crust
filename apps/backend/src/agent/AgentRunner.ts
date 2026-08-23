import { query } from "@anthropic-ai/claude-agent-sdk";

export type AgentEvent =
    | { type: "tool-call"; id?: string; name: string; input?: unknown }
    | { type: "done"; anthropicSessionId?: string; subtype: string; result?: string };

export type AgentRunOptions = {
    prompt: string;
    cwd: string;
    resume?: string;
};

export class AgentRunner {
    async *run(options: AgentRunOptions): AsyncGenerator<AgentEvent> {
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
                yield {
                    type: "done",
                    anthropicSessionId: message.session_id,
                    subtype: message.subtype,
                    result: message.subtype === "success" ? message.result : undefined,
                };
            }
        }
    }
}

export const agentRunner = new AgentRunner();
