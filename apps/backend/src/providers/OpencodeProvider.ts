import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type { ProviderId } from "commons";
import type { AgentEvent, Provider, ProviderRunOptions } from "./Provider";

export class OpencodeProvider implements Provider {
    readonly id: ProviderId = "opencode";

    isConfigured(): boolean {
        return Boolean(process.env.OPENCODE_API_KEY);
    }

    async *run(options: ProviderRunOptions): AsyncGenerator<AgentEvent> {
        const { server } = await createOpencode();
        const client = createOpencodeClient({
            baseUrl: server.url,
            directory: options.cwd,
        });

        try {
            let sessionId = options.resume;
            if (!sessionId) {
                const created = await client.session.create();
                sessionId = created.data?.id;
                if (!sessionId) {
                    yield { type: "done", ok: false, errorMessage: "opencode session create failed" };
                    return;
                }
            }

            const events = await client.event.subscribe();
            const prompt = client.session.prompt({
                path: { id: sessionId },
                body: {
                    parts: [{ type: "text", text: options.prompt }],
                },
            });

            let lastText: string | undefined;
            for await (const event of events.stream) {
                const payload = event as { type?: string; properties?: Record<string, unknown> };
                if (payload.type?.includes("tool") || payload.type === "tool.start") {
                    const props = payload.properties ?? {};
                    yield {
                        type: "tool-call",
                        id: typeof props.id === "string" ? props.id : undefined,
                        name: typeof props.name === "string" ? props.name : "tool",
                        input: props.input ?? props,
                    };
                }
                if (payload.type === "session.idle") {
                    break;
                }
            }

            const result = await prompt;
            const text = extractText(result.data);
            lastText = text ?? lastText;

            yield {
                type: "done",
                ok: !result.error,
                result: lastText,
                providerSessionId: sessionId,
                errorMessage: result.error ? String(result.error) : undefined,
            };
        } finally {
            server.close();
        }
    }
}

function extractText(data: unknown): string | undefined {
    if (!data || typeof data !== "object") return undefined;
    const record = data as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    const parts = record.parts;
    if (!Array.isArray(parts)) return undefined;
    const texts = parts
        .map((part) => {
            if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
                return part.text;
            }
            return "";
        })
        .filter(Boolean);
    return texts.length > 0 ? texts.join("\n") : undefined;
}

export const opencodeProvider = new OpencodeProvider();
