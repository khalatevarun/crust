import { networkInterfaces } from "node:os";
import { probeServeOrigin } from "./serveOrigin";

export type OriginKind = "env" | "tailscale-serve" | "lan" | "loopback";

export type AdvertisedOrigin = {
    kind: OriginKind;
    url: string;
};

export async function resolveAdvertisedOrigin(args: {
    port: number;
    env?: NodeJS.Dict<string>;
    probeServe?: () => Promise<string | undefined>;
}): Promise<AdvertisedOrigin> {
    const fromEnv = (args.env ?? process.env).CRUST_BACKEND_URL;
    if (fromEnv && fromEnv.length > 0) {
        return { kind: "env", url: fromEnv.replace(/\/$/, "") };
    }
    const probe = args.probeServe ?? (() => probeServeOrigin({ backendPort: args.port }));
    const serve = await probe();
    if (serve) return { kind: "tailscale-serve", url: serve };
    const ip = firstLanIpv4();
    if (ip) return { kind: "lan", url: `http://${ip}:${args.port}` };
    return { kind: "loopback", url: `http://localhost:${args.port}` };
}

function firstLanIpv4(): string | undefined {
    for (const addrs of Object.values(networkInterfaces())) {
        for (const addr of addrs ?? []) {
            if (addr.internal) continue;
            const family = addr.family;
            if (family === "IPv4" || family === 4) return addr.address;
        }
    }
    return undefined;
}
