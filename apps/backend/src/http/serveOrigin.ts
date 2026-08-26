import { execFile as execFileCb } from "node:child_process";

export type ExecFile = (
    file: string,
    args: string[],
    opts: { timeout: number },
) => Promise<{ stdout: string; status: number }>;

const SERVE_ARGS = ["serve", "status", "--json"] as const;
const SERVE_TIMEOUT_MS = 2000;
const TAILSCALE_BINARIES = [
    "tailscale",
    "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
] as const;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

type RankedOrigin = {
    url: string;
    https: boolean;
    implicitPort: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultExec(
    file: string,
    args: string[],
    opts: { timeout: number },
): Promise<{ stdout: string; status: number }> {
    return new Promise((resolve) => {
        execFileCb(file, args, { timeout: opts.timeout, encoding: "utf8" }, (err, stdout) => {
            if (!err) {
                resolve({ stdout: String(stdout), status: 0 });
                return;
            }
            const status = "status" in err && typeof err.status === "number" && err.status !== 0
                ? err.status
                : 1;
            const out = "stdout" in err && err.stdout != null ? String(err.stdout) : "";
            resolve({ stdout: out, status });
        });
    });
}

function layersFromServeStatus(json: unknown): Array<{ web: unknown; tcp: unknown }> {
    if (!isRecord(json)) return [];
    const layers: Array<{ web: unknown; tcp: unknown }> = [{ web: json.Web, tcp: json.TCP }];
    if (isRecord(json.Foreground)) {
        for (const value of Object.values(json.Foreground)) {
            if (isRecord(value)) layers.push({ web: value.Web, tcp: value.TCP });
        }
    }
    if (isRecord(json.Services)) {
        for (const value of Object.values(json.Services)) {
            if (isRecord(value)) layers.push({ web: value.Web, tcp: value.TCP });
        }
    }
    return layers;
}

function splitHostPort(hostPort: string): { host: string; port: number } | undefined {
    const colon = hostPort.lastIndexOf(":");
    if (colon <= 0) return undefined;
    const host = hostPort.slice(0, colon);
    const port = Number(hostPort.slice(colon + 1));
    if (!host || !Number.isInteger(port) || port <= 0) return undefined;
    return { host, port };
}

function tcpHttps(tcp: unknown, port: number): boolean {
    if (!isRecord(tcp)) return false;
    const handler = tcp[String(port)];
    return isRecord(handler) && handler.HTTPS === true;
}

function originFromHostPort(hostPort: string, tcp: unknown): RankedOrigin | undefined {
    const split = splitHostPort(hostPort);
    if (!split) return undefined;
    if (split.port === 443) {
        return { url: `https://${split.host}`, https: true, implicitPort: true };
    }
    if (split.port === 80) {
        return { url: `http://${split.host}`, https: false, implicitPort: true };
    }
    const https = tcpHttps(tcp, split.port);
    return {
        url: `${https ? "https" : "http"}://${split.host}:${split.port}`,
        https,
        implicitPort: false,
    };
}

function proxyLoopbackPort(proxy: string): number | undefined {
    const trimmed = proxy.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    try {
        const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`http://${trimmed}`);
        if (!LOOPBACK_HOSTS.has(url.hostname)) return undefined;
        if (url.port) return Number(url.port);
        return url.protocol === "https:" ? 443 : 80;
    } catch {
        return undefined;
    }
}

function rank(origin: RankedOrigin): number {
    if (origin.https && origin.implicitPort) return 3;
    if (origin.https) return 2;
    return 1;
}

function handlersFromWeb(web: unknown): Array<{ hostPort: string; proxy: string }> {
    if (!isRecord(web)) return [];
    const found: Array<{ hostPort: string; proxy: string }> = [];
    for (const [hostPort, server] of Object.entries(web)) {
        if (!isRecord(server) || !isRecord(server.Handlers)) continue;
        for (const handler of Object.values(server.Handlers)) {
            if (!isRecord(handler) || typeof handler.Proxy !== "string") continue;
            found.push({ hostPort, proxy: handler.Proxy });
        }
    }
    return found;
}

export function parseServeOrigin(json: unknown, backendPort: number): string | undefined {
    const matches: RankedOrigin[] = [];
    for (const layer of layersFromServeStatus(json)) {
        for (const handler of handlersFromWeb(layer.web)) {
            if (proxyLoopbackPort(handler.proxy) !== backendPort) continue;
            const origin = originFromHostPort(handler.hostPort, layer.tcp);
            if (origin) matches.push(origin);
        }
    }
    if (matches.length === 0) return undefined;
    matches.sort((a, b) => rank(b) - rank(a));
    return matches[0].url;
}

export async function probeServeOrigin(args: {
    backendPort: number;
    exec?: ExecFile;
}): Promise<string | undefined> {
    const exec = args.exec ?? defaultExec;
    for (const file of TAILSCALE_BINARIES) {
        const result = await exec(file, [...SERVE_ARGS], { timeout: SERVE_TIMEOUT_MS });
        if (result.status !== 0) continue;
        try {
            const parsed: unknown = JSON.parse(result.stdout);
            return parseServeOrigin(parsed, args.backendPort);
        } catch {
            return undefined;
        }
    }
    return undefined;
}
