import { existsSync, readFileSync } from "node:fs";

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function envHasAny(env: NodeJS.Dict<string>, keys: readonly string[]): boolean {
    return keys.some((key) => Boolean(env[key]));
}

export function readJsonRecord(path: string): Record<string, unknown> | null {
    if (!existsSync(path)) return null;
    try {
        const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
        return isRecord(raw) ? raw : null;
    } catch {
        return null;
    }
}

export function readEnvFile(path: string): Record<string, string> {
    if (!existsSync(path)) return {};
    const values: Record<string, string> = {};
    for (const line of readFileSync(path, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (key.length > 0 && value.length > 0) values[key] = value;
    }
    return values;
}
