import type { ProviderId } from "commons";

export type AgentEvent =
    | { type: "tool-call"; id?: string; name: string; input?: unknown }
    | { type: "done"; ok: boolean; result?: string; providerSessionId?: string; errorMessage?: string };

export type ProviderRunOptions = {
    prompt: string;
    cwd: string;
    model: string;
    resume?: string;
};

export interface Provider {
    readonly id: ProviderId;
    isConfigured(): boolean;
    setupHint(): string;
    run(options: ProviderRunOptions): AsyncGenerator<AgentEvent>;
}
