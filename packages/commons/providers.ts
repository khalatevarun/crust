export const PROVIDER_IDS = ["claude", "codex", "opencode", "cursor", "gemini"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: unknown): value is ProviderId {
    return typeof value === "string" && PROVIDER_IDS.some((id) => id === value);
}

export type ModelOption = { id: string; label: string };

export const PROVIDER_MODELS: Record<ProviderId, ModelOption[]> = {
    claude: [
        { id: "claude-opus-5", label: "Opus 5" },
        { id: "claude-sonnet-5", label: "Sonnet 5" },
        { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
    ],
    codex: [
        { id: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
        { id: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
    ],
    opencode: [
        { id: "opencode-default", label: "Default" },
    ],
    cursor: [
        { id: "composer-2.5", label: "Composer 2.5" },
    ],
    gemini: [
        { id: "gemini-3-pro", label: "Gemini 3 Pro" },
        { id: "gemini-3-flash", label: "Gemini 3 Flash" },
    ],
};

export const DEFAULT_MODEL_ID: Record<ProviderId, string> = {
    claude: "claude-sonnet-5",
    codex: "gpt-5.1-codex",
    opencode: "opencode-default",
    cursor: "composer-2.5",
    gemini: "gemini-3-pro",
};
