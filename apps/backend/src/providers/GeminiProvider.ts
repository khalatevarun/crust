import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import type { ProviderId } from "commons";
import { envHasAny, readEnvFile, readJsonRecord } from "./localAuth";
import type { AgentEvent, Provider, ProviderRunOptions } from "./Provider";

function geminiApiKey(
    env: NodeJS.Dict<string>,
    home: string,
): string | undefined {
    if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY;
    if (env.GOOGLE_API_KEY) return env.GOOGLE_API_KEY;
    const fromFile = readEnvFile(join(home, ".gemini/.env"));
    return fromFile.GEMINI_API_KEY ?? fromFile.GOOGLE_API_KEY;
}

export function geminiIsConfigured(
    env: NodeJS.Dict<string> = process.env,
    home: string = homedir(),
): boolean {
    if (envHasAny(env, ["GEMINI_API_KEY", "GOOGLE_API_KEY"])) return true;
    if (env.GOOGLE_APPLICATION_CREDENTIALS && existsSync(env.GOOGLE_APPLICATION_CREDENTIALS)) {
        return true;
    }
    if (geminiApiKey(env, home)) return true;
    if (readJsonRecord(join(home, ".gemini/oauth_creds.json"))) return true;
    const accounts = readJsonRecord(join(home, ".gemini/google_accounts.json"));
    return typeof accounts?.active === "string" && accounts.active.length > 0;
}

export class GeminiProvider implements Provider {
    readonly id: ProviderId = "gemini";

    isConfigured(): boolean {
        return geminiIsConfigured();
    }

    setupHint(): string {
        return "gemini is not configured. Run `gemini` in a terminal and choose Login with Google, or set GEMINI_API_KEY in apps/backend/.env and restart the backend.";
    }

    async *run(options: ProviderRunOptions): AsyncGenerator<AgentEvent> {
        const apiKey = geminiApiKey(process.env, homedir());
        const ai = apiKey
            ? new GoogleGenAI({ apiKey })
            : process.env.GOOGLE_GENAI_USE_VERTEXAI === "true"
                ? new GoogleGenAI({
                    vertexai: true,
                    project: process.env.GOOGLE_CLOUD_PROJECT,
                    location: process.env.GOOGLE_CLOUD_LOCATION,
                })
                : new GoogleGenAI({});
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
