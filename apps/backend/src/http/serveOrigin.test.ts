import { expect, test } from "bun:test";
import { parseServeOrigin, probeServeOrigin } from "./serveOrigin";

const NODE_WEB = {
    TCP: { "443": { HTTPS: true } },
    Web: {
        "node.tailxxxxx.ts.net:443": {
            Handlers: {
                "/": { Proxy: "http://127.0.0.1:3001" },
            },
        },
    },
};

test("root Web proxy on 443 becomes https without a port", () => {
    expect(parseServeOrigin(NODE_WEB, 3001)).toBe("https://node.tailxxxxx.ts.net");
});

test("Services Web uses the same handler shape", () => {
    expect(parseServeOrigin({
        Services: {
            "svc:crust": {
                TCP: { "443": { HTTPS: true } },
                Web: {
                    "registry.my-net.ts.net:443": {
                        Handlers: {
                            "/": { Proxy: "http://127.0.0.1:3001" },
                        },
                    },
                },
            },
        },
    }, 3001)).toBe("https://registry.my-net.ts.net");
});

test("Foreground Web uses the same handler shape", () => {
    expect(parseServeOrigin({
        Foreground: {
            abc123: {
                TCP: { "443": { HTTPS: true } },
                Web: {
                    "foo.test.ts.net:443": {
                        Handlers: {
                            "/": { Proxy: "http://127.0.0.1:3001" },
                        },
                    },
                },
            },
        },
    }, 3001)).toBe("https://foo.test.ts.net");
});

test("a proxy on another port is ignored", () => {
    expect(parseServeOrigin({
        TCP: { "443": { HTTPS: true } },
        Web: {
            "node.tailxxxxx.ts.net:443": {
                Handlers: {
                    "/": { Proxy: "http://127.0.0.1:9999" },
                },
            },
        },
    }, 3001)).toBeUndefined();
});

test("AllowFunnel does not change the origin", () => {
    expect(parseServeOrigin({
        ...NODE_WEB,
        AllowFunnel: { "node.tailxxxxx.ts.net:443": true },
    }, 3001)).toBe("https://node.tailxxxxx.ts.net");
});

test("null and empty status have no origin", () => {
    expect(parseServeOrigin(null, 3001)).toBeUndefined();
    expect(parseServeOrigin({}, 3001)).toBeUndefined();
});

test("https on a non-443 port keeps the port", () => {
    expect(parseServeOrigin({
        TCP: { "8443": { HTTPS: true } },
        Web: {
            "node.tailxxxxx.ts.net:8443": {
                Handlers: {
                    "/": { Proxy: "http://localhost:3001" },
                },
            },
        },
    }, 3001)).toBe("https://node.tailxxxxx.ts.net:8443");
});

test("https on 443 beats an extra https port", () => {
    expect(parseServeOrigin({
        TCP: {
            "443": { HTTPS: true },
            "8443": { HTTPS: true },
        },
        Web: {
            "node.tailxxxxx.ts.net:8443": {
                Handlers: {
                    "/": { Proxy: "http://127.0.0.1:3001" },
                },
            },
            "node.tailxxxxx.ts.net:443": {
                Handlers: {
                    "/": { Proxy: "http://127.0.0.1:3001" },
                },
            },
        },
    }, 3001)).toBe("https://node.tailxxxxx.ts.net");
});

test("a bare port proxy on loopback counts", () => {
    expect(parseServeOrigin({
        TCP: { "443": { HTTPS: true } },
        Web: {
            "node.tailxxxxx.ts.net:443": {
                Handlers: { "/": { Proxy: "3001" } },
            },
        },
    }, 3001)).toBe("https://node.tailxxxxx.ts.net");
});

test("probeServeOrigin parses stdout from the first CLI that exits 0", async () => {
    const origin = await probeServeOrigin({
        backendPort: 3001,
        exec: async (file) => {
            if (file === "tailscale") return { stdout: "", status: 1 };
            return { stdout: JSON.stringify(NODE_WEB), status: 0 };
        },
    });
    expect(origin).toBe("https://node.tailxxxxx.ts.net");
});

test("probeServeOrigin does not try the next binary after a successful empty config", async () => {
    const files: string[] = [];
    const origin = await probeServeOrigin({
        backendPort: 3001,
        exec: async (file) => {
            files.push(file);
            return { stdout: "{}", status: 0 };
        },
    });
    expect(origin).toBeUndefined();
    expect(files).toEqual(["tailscale"]);
});

test("probeServeOrigin returns undefined when no binary runs", async () => {
    const origin = await probeServeOrigin({
        backendPort: 3001,
        exec: async () => ({ stdout: "", status: 1 }),
    });
    expect(origin).toBeUndefined();
});
