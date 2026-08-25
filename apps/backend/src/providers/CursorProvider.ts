import { homedir } from "node:os";
import { join } from "node:path";
import { Agent } from "@cursor/sdk";
import type { ProviderId } from "commons";
import { envHasAny, readJsonRecord } from "./localAuth";
import type { AgentEvent, Provider, ProviderRunOptions } from "./Provider";

export function cursorIsConfigured(
    env: NodeJS.Dict<string> = process.env,
    home: string = homedir(),
): boolean {
    if (envHasAny(env, ["CURSOR_API_KEY"])) return true;
    return readJsonRecord(join(home, ".cursor/sdk/auth.json")) !== null;
}

type CursorAgentOptions = {
    apiKey?: string;
    model: { id: string };
    local: { cwd: string };
};

type CursorRun = {
    stream(): AsyncIterable<{
        type: string;
        status?: string;
        call_id?: string;
        name?: string;
        args?: unknown;
    }>;
    wait(): Promise<{ status: string; result?: string }>;
};

export type CursorAgentHandle = {
    readonly agentId: string;
    send(prompt: string, options?: { model: { id: string } }): Promise<CursorRun>;
};

export type CursorAgentApi = {
    create(options: CursorAgentOptions): Promise<CursorAgentHandle>;
    resume(id: string, options?: CursorAgentOptions): Promise<CursorAgentHandle>;
};

const defaultAgentApi: CursorAgentApi = {
    create: (options) => Agent.create(options),
    resume: (id, options) => Agent.resume(id, options),
};

const liveAgents = new Map<string, CursorAgentHandle>();

function agentOptions(options: ProviderRunOptions): CursorAgentOptions {
    const apiKey = process.env.CURSOR_API_KEY;
    return {
        ...(apiKey ? { apiKey } : {}),
        model: { id: options.model },
        local: { cwd: options.cwd },
    };
}

export class CursorProvider implements Provider {
    readonly id: ProviderId = "cursor";

    constructor(private readonly agentApi: CursorAgentApi = defaultAgentApi) {}

    isConfigured(): boolean {
        return cursorIsConfigured();
    }

    setupHint(): string {
        return [
            "cursor is not configured. @cursor/sdk is already in the backend. Signing into the Cursor app does not count.",
            "From apps/backend run: bun run login:cursor",
            "Or set CURSOR_API_KEY in apps/backend/.env from https://cursor.com/dashboard/integrations and restart the backend.",
        ].join("\n");
    }

    async *run(options: ProviderRunOptions): AsyncGenerator<AgentEvent> {
        const agent = await this.acquire(options);
        const run = await agent.send(options.prompt, { model: { id: options.model } });
        const seen = new Set<string>();
        for await (const event of run.stream()) {
            if (event.type !== "tool_call" || typeof event.name !== "string") continue;
            if (event.status !== "running" && event.status !== "completed") continue;
            const key = event.call_id ?? event.name;
            if (seen.has(key)) continue;
            seen.add(key);
            yield {
                type: "tool-call",
                id: event.call_id,
                name: event.name,
                input: event.args,
            };
        }
        const result = await run.wait();
        yield {
            type: "done",
            ok: result.status === "finished",
            result: result.result,
            providerSessionId: agent.agentId,
            errorMessage: result.status === "finished" ? undefined : result.status,
        };
    }

    private async acquire(options: ProviderRunOptions): Promise<CursorAgentHandle> {
        if (options.resume) {
            const live = liveAgents.get(options.resume);
            if (live) return live;
            const resumed = await this.agentApi.resume(options.resume, agentOptions(options));
            liveAgents.set(resumed.agentId, resumed);
            return resumed;
        }

        const created = await this.agentApi.create(agentOptions(options));
        liveAgents.set(created.agentId, created);
        return created;
    }
}

export const cursorProvider = new CursorProvider();

export function resetCursorAgentsForTests(): void {
    liveAgents.clear();
}
