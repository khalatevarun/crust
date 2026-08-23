import { Agent } from "@cursor/sdk";
import type { ProviderId } from "commons";
import type { AgentEvent, Provider, ProviderRunOptions } from "./Provider";

export class CursorProvider implements Provider {
    readonly id: ProviderId = "cursor";

    isConfigured(): boolean {
        return Boolean(process.env.CURSOR_API_KEY);
    }

    async *run(options: ProviderRunOptions): AsyncGenerator<AgentEvent> {
        const apiKey = process.env.CURSOR_API_KEY;
        if (!apiKey) {
            yield { type: "done", ok: false, errorMessage: "missing CURSOR_API_KEY" };
            return;
        }
        const agent = options.resume
            ? await Agent.resume(options.resume, { apiKey })
            : await Agent.create({
                apiKey,
                model: { id: "composer-2.5" },
                local: { cwd: options.cwd },
            });

        try {
            const run = await agent.send(options.prompt);
            for await (const event of run.stream()) {
                if (event.type === "tool_call" && event.status === "running") {
                    yield {
                        type: "tool-call",
                        id: event.call_id,
                        name: event.name,
                        input: event.args,
                    };
                }
            }
            const result = await run.wait();
            yield {
                type: "done",
                ok: result.status === "finished",
                result: result.result,
                providerSessionId: agent.agentId,
                errorMessage: result.status === "finished" ? undefined : result.status,
            };
        } finally {
            await agent.close();
        }
    }
}

export const cursorProvider = new CursorProvider();
