import { expect, test } from "bun:test";
import { resolveAdvertisedOrigin } from "./advertisedUrl";

test("CRUST_BACKEND_URL wins and drops a trailing slash", async () => {
    const origin = await resolveAdvertisedOrigin({
        port: 3001,
        env: { CRUST_BACKEND_URL: "https://crust.example.ts.net/" },
        probeServe: async () => {
            throw new Error("probe should not run when env is set");
        },
    });
    expect(origin).toEqual({ kind: "env", url: "https://crust.example.ts.net" });
});

test("a Serve origin wins over LAN when env is empty", async () => {
    const origin = await resolveAdvertisedOrigin({
        port: 3001,
        env: {},
        probeServe: async () => "https://node.tailxxxxx.ts.net",
    });
    expect(origin).toEqual({
        kind: "tailscale-serve",
        url: "https://node.tailxxxxx.ts.net",
    });
});

test("without env or Serve, the url is http on the given port", async () => {
    const origin = await resolveAdvertisedOrigin({
        port: 3001,
        env: {},
        probeServe: async () => undefined,
    });
    expect(origin.kind === "lan" || origin.kind === "loopback").toBe(true);
    expect(origin.url).toMatch(/^http:\/\/[^/]+:3001$/);
});
