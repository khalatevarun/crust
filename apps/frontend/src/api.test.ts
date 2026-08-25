import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { ensureDesktopToken, getStoredToken } from "./api";

const TOKEN_KEY = "crust.deviceToken";

function installStorage() {
    const mem = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (k: string) => mem.get(k) ?? null,
            setItem: (k: string, v: string) => {
                mem.set(k, v);
            },
            removeItem: (k: string) => {
                mem.delete(k);
            },
            clear: () => mem.clear(),
        },
    });
}

let fetchMock: ReturnType<typeof mock>;

beforeEach(() => {
    installStorage();
    fetchMock = mock(async () => new Response("not mocked", { status: 500 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
    mock.restore();
});

test("ensureDesktopToken re-pairs when the stored token is rejected", async () => {
    localStorage.setItem(TOKEN_KEY, "stale-token");
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const auth = new Headers(init?.headers).get("Authorization");
        if (url.endsWith("/api/devices") && auth === "Bearer stale-token") {
            return new Response(JSON.stringify({ error: "unauthorized" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }
        if (url.endsWith("/api/devices/pair") && init?.method === "POST") {
            expect(auth).toBeNull();
            return new Response(JSON.stringify({ token: "fresh-token" }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
            });
        }
        return new Response("unexpected", { status: 500 });
    });

    await ensureDesktopToken();
    expect(getStoredToken()).toBe("fresh-token");
});
