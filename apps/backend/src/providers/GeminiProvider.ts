import { GoogleGenAI } from "@google/genai";
import type { ProviderId } from "commons";
import type { AgentEvent, Provider, ProviderRunOptions } from "./Provider";

// @google/gemini-cli-sdk is unpublished. @google/genai chat has no filesystem tools.
export class GeminiProvider implements Provider {
    readonly id: ProviderId = "gemini";

    isConfigured(): boolean {
        return Boolean(process.env.GEMINI_API_KEY);
    }

    async *run(options: ProviderRunOptions): AsyncGenerator<AgentEvent> {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            yield { type: "done", ok: false, errorMessage: "missing GEMINI_API_KEY" };
            return;
        }
        const ai = new GoogleGenAI({ apiKey });
        const chat = ai.chats.create({
            model: options.model,
            config: {
                systemInstruction: `You are a coding assistant. The workspace directory is ${options.cwd}. You cannot read or edit files directly.`,
            },
            history: [],
        });

        try {
            const response = await chat.sendMessage({ message: options.prompt });
            const text = response.text;
            yield {
                type: "done",
                ok: Boolean(text),
                result: text,
                providerSessionId: options.resume,
                errorMessage: text ? undefined : "empty gemini response",
            };
        } catch (err) {
            yield {
                type: "done",
                ok: false,
                errorMessage: err instanceof Error ? err.message : String(err),
            };
        }
    }
}

export const geminiProvider = new GeminiProvider();
