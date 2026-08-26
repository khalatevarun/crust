import { expect, test } from "bun:test";
import { backendUrlKind, isUnreachableError, normalizeBackendUrl, reachError } from "./backendUrl";

test("normalizeBackendUrl strips a trailing slash and rejects junk", () => {
    expect(normalizeBackendUrl("https://node.tailxxxxx.ts.net/")).toBe("https://node.tailxxxxx.ts.net");
    expect(normalizeBackendUrl("  http://192.168.1.8:3001/  ")).toBe("http://192.168.1.8:3001");
    expect(normalizeBackendUrl("not a url")).toBeNull();
    expect(normalizeBackendUrl("ftp://x")).toBeNull();
});

test("backendUrlKind classifies loopback, tailnet, and LAN", () => {
    expect(backendUrlKind("http://localhost:3001")).toBe("loopback");
    expect(backendUrlKind("http://127.0.0.1:3001")).toBe("loopback");
    expect(backendUrlKind("https://node.tailxxxxx.ts.net")).toBe("tailnet");
    expect(backendUrlKind("http://192.168.1.8:3001")).toBe("other");
});

test("reachError names Tailscale for ts.net and Wi-Fi for LAN", () => {
    expect(reachError("https://node.tailxxxxx.ts.net")).toContain("Connect Tailscale");
    expect(reachError("http://192.168.1.8:3001")).toContain("same Wi-Fi");
    expect(reachError("http://localhost:3001")).toContain("cannot be localhost");
});

test("isUnreachableError matches fetch failures, not HTTP 401 text", () => {
    expect(isUnreachableError(new TypeError("Network request failed"))).toBe(true);
    expect(isUnreachableError(new Error("Network request failed"))).toBe(true);
    expect(isUnreachableError(new Error("unauthorized"))).toBe(false);
});
