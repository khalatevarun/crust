export type PairPayload = {
    token: string;
    backendUrl: string;
};

export function parsePairPayload(raw: string): PairPayload | null {
    try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object") return null;
        const record = value as { token?: unknown; backendUrl?: unknown };
        if (typeof record.token !== "string" || typeof record.backendUrl !== "string") return null;
        if (!record.token || !record.backendUrl) return null;
        return { token: record.token, backendUrl: record.backendUrl };
    } catch {
        return null;
    }
}
