export type BackendUrlKind = "loopback" | "tailnet" | "other";

export function normalizeBackendUrl(url: string): string | null {
    const trimmed = url.trim().replace(/\/+$/, "");
    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return trimmed;
}

export function backendUrlKind(url: string): BackendUrlKind {
    let host: string;
    try {
        host = new URL(url).hostname.toLowerCase();
    } catch {
        return "other";
    }
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") {
        return "loopback";
    }
    if (host === "ts.net" || host.endsWith(".ts.net")) return "tailnet";
    return "other";
}

export function isUnreachableError(err: unknown): boolean {
    if (err instanceof TypeError) return true;
    if (!(err instanceof Error)) return false;
    const message = err.message;
    return message === "Network request failed"
        || message === "Failed to fetch"
        || message === "The Internet connection appears to be offline."
        || message.startsWith("Failed to connect");
}

export function reachError(url: string): string {
    const kind = backendUrlKind(url);
    switch (kind) {
        case "loopback":
            return `Cannot reach ${url}. The QR host cannot be localhost. Pair from the desktop Devices screen so the URL is the Mac's LAN address or a https://*.ts.net Serve URL.`;
        case "tailnet":
            return `Cannot reach ${url}. Connect Tailscale on this phone, using the same account as the Mac, and leave the VPN on.`;
        case "other":
            return `Cannot reach ${url}. Stay on the same Wi-Fi as the Mac, or pair again after tailscale serve --bg 3001 so the QR is https://*.ts.net.`;
        default: {
            const _exhaustive: never = kind;
            return _exhaustive;
        }
    }
}
