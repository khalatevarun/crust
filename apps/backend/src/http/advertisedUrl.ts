import { networkInterfaces } from "node:os";

export function advertisedBackendUrl(args: {
    port: number;
    env?: NodeJS.Dict<string>;
}): string {
    const fromEnv = (args.env ?? process.env).CRUST_BACKEND_URL;
    if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/$/, "");
    const ip = firstLanIpv4();
    if (ip) return `http://${ip}:${args.port}`;
    return `http://localhost:${args.port}`;
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
