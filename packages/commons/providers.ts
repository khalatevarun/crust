export const PROVIDER_IDS = ["claude", "codex", "opencode", "cursor", "gemini"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: unknown): value is ProviderId {
    return typeof value === "string" && PROVIDER_IDS.some((id) => id === value);
}
