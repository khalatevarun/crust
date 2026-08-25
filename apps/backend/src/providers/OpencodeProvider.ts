import { homedir } from "node:os";
import { join } from "node:path";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type { ProviderId } from "commons";
import { envHasAny, isRecord, readJsonRecord } from "./localAuth";
import type { AgentEvent, Provider, ProviderRunOptions } from "./Provider";

export function opencodeIsConfigured(
    env: NodeJS.Dict<string> = process.env,
    home: string = homedir(),
): boolean {
    if (envHasAny(env, ["OPENCODE_API_KEY", "OPENCODE_ZEN_API_KEY"])) return true;
    const dataHome = env.XDG_DATA_HOME ?? join(home, ".local/share");
    const auth = readJsonRecord(join(dataHome, "opencode", "auth.json"));
    return auth !== null && Object.keys(auth).length > 0;
}

type OpencodeServer = {
    url: string;
    close(): void;
};

type OpencodeEvent = {
    type?: string;
    properties?: Record<string, unknown>;
};

type PromptBody = {
    model?: { providerID: string; modelID: string };
    parts: Array<{ type: "text"; text: string }>;
};

export type OpencodeStart = (options: {
    hostname: string;
    port: number;
}) => Promise<{ server: OpencodeServer }>;

export type OpencodeConnect = (options: {
    baseUrl: string;
    directory?: string;
}) => {
    session: {
        create(): Promise<{ data?: { id?: string } }>;
        prompt(args: {
            path: { id: string };
            body: PromptBody;
        }): Promise<{ data?: unknown; error?: unknown }>;
    };
    event: {
        subscribe(options?: { signal?: AbortSignal }): Promise<{ stream: AsyncIterable<OpencodeEvent> }>;
    };
};

type ToolCallEvent = Extract<AgentEvent, { type: "tool-call" }>;

let shared: { server: OpencodeServer } | undefined;

async function ensureServer(start: OpencodeStart): Promise<{ server: OpencodeServer }> {
    if (!shared) {
        shared = await start({ hostname: "127.0.0.1", port: 0 });
    }
    return shared;
}

export function resetOpencodeServerForTests(): void {
    shared = undefined;
}

export class OpencodeProvider implements Provider {
    readonly id: ProviderId = "opencode";

    constructor(
        private readonly start: OpencodeStart = createOpencode,
        private readonly connect: OpencodeConnect = createOpencodeClient,
    ) {}

    isConfigured(): boolean {
        return opencodeIsConfigured();
    }

    setupHint(): string {
        return "opencode is not configured. Run `opencode auth login` in a terminal, or set OPENCODE_API_KEY in apps/backend/.env and restart the backend.";
    }

    async *run(options: ProviderRunOptions): AsyncGenerator<AgentEvent> {
        const { server } = await ensureServer(this.start);
        const client = this.connect({
            baseUrl: server.url,
            directory: options.cwd,
        });

        let sessionId = options.resume;
        if (!sessionId) {
            const created = await client.session.create();
            sessionId = created.data?.id;
            if (!sessionId) {
                yield { type: "done", ok: false, errorMessage: "opencode session create failed" };
                return;
            }
        }

        const body: PromptBody = {
            parts: [{ type: "text", text: options.prompt }],
        };
        if (options.model !== "opencode-default") {
            body.model = { providerID: "opencode", modelID: options.model };
        }

        const abort = new AbortController();
        try {
            const events = await client.event.subscribe({ signal: abort.signal });
            const prompt = client.session.prompt({
                path: { id: sessionId },
                body,
            });
            yield* liveToolsThenDone({ stream: events.stream, prompt, sessionId });
        } finally {
            abort.abort();
        }
    }
}

async function* liveToolsThenDone(args: {
    stream: AsyncIterable<OpencodeEvent>;
    prompt: Promise<{ data?: unknown; error?: unknown }>;
    sessionId: string;
}): AsyncGenerator<AgentEvent> {
    const seen = new Set<string>();
    const queue: AgentEvent[] = [];
    let wake: (() => void) | undefined;
    let closed = false;

    const push = (event: AgentEvent): void => {
        queue.push(event);
        wake?.();
        wake = undefined;
    };

    const pushTool = (tool: ToolCallEvent): void => {
        const key = tool.id ?? `${tool.name}:${JSON.stringify(tool.input ?? null)}`;
        if (seen.has(key)) return;
        seen.add(key);
        push(tool);
    };

    void (async () => {
        try {
            for await (const payload of args.stream) {
                if (closed) break;
                const sid = eventSessionId(payload);
                if (sid && sid !== args.sessionId) continue;
                if (payload.type === "session.idle" || payload.type === "session.error") break;
                const tool = toolFromOpencodeEvent(payload);
                if (tool) pushTool(tool);
            }
        } catch {
            // subscribe aborted or stream ended
        }
    })();

    const finish = args.prompt.then(
        (result) => {
            for (const tool of toolsFromData(result.data)) {
                pushTool(tool);
            }
            push({
                type: "done",
                ok: !result.error,
                result: extractText(result.data),
                providerSessionId: args.sessionId,
                errorMessage: result.error ? String(result.error) : undefined,
            });
        },
        (err: unknown) => {
            push({
                type: "done",
                ok: false,
                providerSessionId: args.sessionId,
                errorMessage: err instanceof Error ? err.message : String(err),
            });
        },
    );

    try {
        while (true) {
            if (queue.length === 0) {
                await new Promise<void>((resolve) => {
                    wake = resolve;
                });
            }
            const event = queue.shift();
            if (!event) continue;
            yield event;
            if (event.type === "done") break;
        }
    } finally {
        closed = true;
        await finish.catch(() => undefined);
    }
}

function eventSessionId(payload: OpencodeEvent): string | undefined {
    const props = payload.properties;
    if (!isRecord(props)) return undefined;
    if (typeof props.sessionID === "string") return props.sessionID;
    if (typeof props.sessionId === "string") return props.sessionId;
    if (isRecord(props.part) && typeof props.part.sessionID === "string") return props.part.sessionID;
    return undefined;
}

function toolFromOpencodeEvent(payload: OpencodeEvent): ToolCallEvent | undefined {
    if (payload.type !== "message.part.updated") return undefined;
    return toolFromPart(payload.properties?.part);
}

function toolsFromData(data: unknown): ToolCallEvent[] {
    if (!isRecord(data) || !Array.isArray(data.parts)) return [];
    const tools: ToolCallEvent[] = [];
    for (const part of data.parts) {
        const tool = toolFromPart(part);
        if (tool) tools.push(tool);
    }
    return tools;
}

function toolFromPart(part: unknown): ToolCallEvent | undefined {
    if (!isRecord(part) || part.type !== "tool") return undefined;
    const name = typeof part.tool === "string"
        ? part.tool
        : typeof part.name === "string"
            ? part.name
            : undefined;
    if (!name) return undefined;
    const id = typeof part.callID === "string"
        ? part.callID
        : typeof part.id === "string"
            ? part.id
            : undefined;
    const state = isRecord(part.state) ? part.state : undefined;
    const input = extractToolInput(part, state);
    const status = typeof state?.status === "string" ? state.status : undefined;
    if (!hasMeaningfulInput(input) && status !== "completed" && status !== "error") {
        return undefined;
    }
    return {
        type: "tool-call",
        id,
        name,
        input,
    };
}

function extractToolInput(
    part: Record<string, unknown>,
    state: Record<string, unknown> | undefined,
): unknown {
    if (hasMeaningfulInput(state?.input)) return state?.input;
    if (hasMeaningfulInput(part.input)) return part.input;
    const fromRaw = parseRawInput(state?.raw);
    if (hasMeaningfulInput(fromRaw)) return fromRaw;
    return undefined;
}

function parseRawInput(raw: unknown): unknown {
    if (typeof raw !== "string" || raw.trim().length === 0) return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

function hasMeaningfulInput(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (isRecord(value)) return Object.keys(value).length > 0;
    return true;
}

function extractText(data: unknown): string | undefined {
    if (!isRecord(data)) return undefined;
    if (typeof data.text === "string") return data.text;
    if (!Array.isArray(data.parts)) return undefined;
    const texts = data.parts.flatMap((part) => {
        if (isRecord(part) && typeof part.text === "string") return [part.text];
        return [];
    });
    return texts.length > 0 ? texts.join("\n") : undefined;
}

export const opencodeProvider = new OpencodeProvider();
