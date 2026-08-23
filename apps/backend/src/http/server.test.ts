import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Message, ProviderId, WorkspaceSummary } from "commons";
import type { AgentEvent, Provider } from "../providers/Provider";
import type { ToolCall, SessionRecord, WorkspaceRecord } from "../repository/ChatRepository";
import { SessionHub } from "./SessionHub";
import { createServer } from "./server";

const WID_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const WID_MISSING = "bbbbbbbbbbbbbbbbbbbbbbbb";
const SID_A = "cccccccccccccccccccccccc";
const SID_MISSING = "dddddddddddddddddddddddd";

class MemoryRepo {
    workspaces = new Map<string, { id: string; name: string; path: string }>();
    sessions = new Map<string, {
        id: string;
        workspaceId: string;
        provider: ProviderId;
        model: string;
        messages: Message[];
        providerSessionId?: string;
    }>();
    nextWorkspace = 0;
    nextSession = 0;

    async createWorkspace(path: string) {
        const id = this.nextWorkspace === 0 ? WID_A : idFromCounter(this.nextWorkspace, "a");
        this.nextWorkspace += 1;
        const name = path.split("/").pop()!;
        const workspace = { id, name, path };
        this.workspaces.set(id, workspace);
        return workspace;
    }

    async createSession(workspaceId: string, provider: ProviderId, model: string) {
        if (!this.workspaces.has(workspaceId)) return null;
        const id = this.nextSession === 0 ? SID_A : idFromCounter(this.nextSession, "c");
        this.nextSession += 1;
        this.sessions.set(id, { id, workspaceId, provider, model, messages: [] });
        return { id, workspaceId, provider, model };
    }

    async appendUserMessage(sessionId: string, message: string) {
        this.sessions.get(sessionId)?.messages.push({ role: "user", payload: { message } });
    }

    async appendAssistantText(sessionId: string, message: string) {
        this.sessions.get(sessionId)?.messages.push({
            role: "assistant",
            payload: { type: "text", message },
        });
    }

    async appendToolCall(sessionId: string, call: ToolCall) {
        this.sessions.get(sessionId)?.messages.push({
            role: "assistant",
            payload: { type: "tool-call", ...call },
        });
    }

    async setProviderSessionId(sessionId: string, providerSessionId: string) {
        const session = this.sessions.get(sessionId);
        if (session) session.providerSessionId = providerSessionId;
    }

    async getSessionWithWorkspace(
        sessionId: string,
    ): Promise<{ session: SessionRecord; workspace: WorkspaceRecord } | null> {
        const session = this.sessions.get(sessionId);
        if (!session) return null;
        const workspace = this.workspaces.get(session.workspaceId);
        if (!workspace) return null;
        return {
            session: {
                id: session.id,
                provider: session.provider,
                model: session.model,
                providerSessionId: session.providerSessionId,
            },
            workspace: { id: workspace.id, path: workspace.path },
        };
    }

    async getSnapshotSummary(): Promise<WorkspaceSummary[]> {
        return [...this.workspaces.values()].map((w) => ({
            ...w,
            sessions: [...this.sessions.values()]
                .filter((s) => s.workspaceId === w.id)
                .map((s) => ({ id: s.id })),
        }));
    }

    async getMessages(sessionId: string): Promise<Message[] | null> {
        const session = this.sessions.get(sessionId);
        if (!session) return null;
        return session.messages;
    }
}

function idFromCounter(n: number, fill: string): string {
    return fill.repeat(24).slice(0, 23) + String(n);
}

class FakeProvider implements Provider {
    events: AgentEvent[] = [];

    constructor(
        readonly id: ProviderId,
        private configured: boolean,
    ) {}

    isConfigured(): boolean {
        return this.configured;
    }

    async *run(): AsyncGenerator<AgentEvent> {
        for (const event of this.events) {
            yield event;
        }
    }
}

const DID_A = "eeeeeeeeeeeeeeeeeeeeeeee";

class MemoryDevices {
    items = new Map<string, {
        id: string;
        name: string;
        tokenHash: string;
        createdAt: Date;
        lastUsedAt?: Date;
    }>();
    next = 0;

    async count() {
        return this.items.size;
    }

    async create(name: string, tokenHash: string) {
        const id = this.next === 0 ? DID_A : idFromCounter(this.next, "e");
        this.next += 1;
        const createdAt = new Date("2026-01-01T00:00:00.000Z");
        const record = { id, name, tokenHash, createdAt };
        this.items.set(id, record);
        return { id, name, createdAt };
    }

    async findByTokenHash(tokenHash: string) {
        const device = [...this.items.values()].find((item) => item.tokenHash === tokenHash);
        if (!device) return null;
        return device;
    }

    async list() {
        return [...this.items.values()].map((item) => ({
            id: item.id,
            name: item.name,
            createdAt: item.createdAt,
            lastUsedAt: item.lastUsedAt,
        }));
    }

    async delete(id: string) {
        return this.items.delete(id);
    }

    touchLastUsed(id: string) {
        const device = this.items.get(id);
        if (device) device.lastUsedAt = new Date();
    }
}

describe("http api", () => {
    const repo = new MemoryRepo();
    const devices = new MemoryDevices();
    const claude = new FakeProvider("claude", true);
    const hub = new SessionHub();
    let server: ReturnType<typeof createServer>;
    let base: string;
    let token = "";

    function api(path: string, init: RequestInit = {}) {
        const headers = new Headers(init.headers);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return fetch(`${base}${path}`, { ...init, headers });
    }

    beforeAll(async () => {
        server = createServer({
            repo: repo as never,
            devices: devices as never,
            providers: {
                claude,
                codex: new FakeProvider("codex", false),
                opencode: new FakeProvider("opencode", false),
                cursor: new FakeProvider("cursor", false),
                gemini: new FakeProvider("gemini", false),
            },
            hub,
            port: 0,
            hostname: "127.0.0.1",
        });
        base = `http://${server.hostname}:${server.port}`;
        const paired = await api(`/api/devices/pair`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Desktop browser" }),
        });
        const body = await paired.json() as { token: string };
        token = body.token;
    });

    afterAll(() => {
        server.stop(true);
    });

    test("requests without a token are 401 once a device exists", async () => {
        const res = await fetch(`${base}/api/snapshot`);
        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "unauthorized" });
    });

    test("POST /api/devices/pair without a token is 401 after bootstrap", async () => {
        const res = await fetch(`${base}/api/devices/pair`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Phone" }),
        });
        expect(res.status).toBe(401);
    });

    test("an authenticated device can pair another device and list both", async () => {
        const paired = await api("/api/devices/pair", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Phone" }),
        });
        expect(paired.status).toBe(201);
        const phone = await paired.json() as { id: string; name: string; token: string };
        expect(phone.name).toBe("Phone");
        expect(phone.token.length).toBeGreaterThan(10);

        const listed = await api("/api/devices");
        expect(listed.status).toBe(200);
        const body = await listed.json() as { devices: { name: string }[] };
        expect(body.devices.map((d) => d.name)).toEqual(["Desktop browser", "Phone"]);

        const revoked = await api(`/api/devices/${phone.id}`, { method: "DELETE" });
        expect(revoked.status).toBe(204);

        const asPhone = await fetch(`${base}/api/snapshot`, {
            headers: { Authorization: `Bearer ${phone.token}` },
        });
        expect(asPhone.status).toBe(401);
    });


    test("POST /api/workspaces creates a workspace", async () => {
        const res = await api(`/api/workspaces`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: "/tmp/demo" }),
        });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body).toEqual({ id: WID_A, name: "demo", path: "/tmp/demo" });
    });

    test("POST /api/workspaces rejects invalid body", async () => {
        const res = await api(`/api/workspaces`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error.length).toBeGreaterThan(0);
    });

    test("GET /api/snapshot returns metadata only", async () => {
        const res = await api(`/api/snapshot`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({
            workspaces: [{ id: WID_A, name: "demo", path: "/tmp/demo", sessions: [] }],
        });
    });

    test("POST session returns 400 for bad id format and 404 when missing", async () => {
        const bad = await api(`/api/workspaces/not-an-id/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "claude" }),
        });
        expect(bad.status).toBe(400);

        const missing = await api(`/api/workspaces/${WID_MISSING}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "claude" }),
        });
        expect(missing.status).toBe(404);
        expect(await missing.json()).toEqual({ error: "workspace not found" });
    });

    test("POST session rejects a missing provider and an unconfigured provider", async () => {
        const missing = await api(`/api/workspaces/${WID_A}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(missing.status).toBe(400);

        const unconfigured = await api(`/api/workspaces/${WID_A}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "codex" }),
        });
        expect(unconfigured.status).toBe(400);
        expect(await unconfigured.json()).toEqual({
            error: "codex is not configured: missing OPENAI_API_KEY",
        });
        expect(await repo.getSnapshotSummary()).toEqual([
            { id: WID_A, name: "demo", path: "/tmp/demo", sessions: [] },
        ]);
    });

    test("POST session rejects an unknown model for the provider", async () => {
        const res = await api(`/api/workspaces/${WID_A}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "claude", model: "gpt-5.1-codex" }),
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
            error: "unknown model 'gpt-5.1-codex' for provider 'claude'",
        });
        expect(await repo.getSnapshotSummary()).toEqual([
            { id: WID_A, name: "demo", path: "/tmp/demo", sessions: [] },
        ]);
    });

    test("POST session creates a session", async () => {
        const res = await api(`/api/workspaces/${WID_A}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "claude" }),
        });
        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({
            id: SID_A,
            workspaceId: WID_A,
            provider: "claude",
            model: "claude-sonnet-5",
        });
    });

    test("POST session persists an explicit model from that provider's catalog", async () => {
        const res = await api(`/api/workspaces/${WID_A}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "claude", model: "claude-opus-5" }),
        });
        expect(res.status).toBe(201);
        const body = await res.json() as { id: string; model: string; provider: string };
        expect(body.provider).toBe("claude");
        expect(body.model).toBe("claude-opus-5");
        expect(body.id).not.toBe(SID_A);
    });

    test("GET messages 404s for unknown session", async () => {
        const res = await api(`/api/sessions/${SID_MISSING}/messages`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "session not found" });
    });

    test("POST message returns 202 and persists the user turn without waiting for the agent", async () => {
        claude.events = [
            { type: "tool-call", id: "t1", name: "Read", input: { path: "x" } },
            { type: "done", ok: true, result: "done", providerSessionId: "prov-1" },
        ];

        const res = await api(`/api/sessions/${SID_A}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "hello" }),
        });
        expect(res.status).toBe(202);
        expect(await res.json()).toEqual({ sessionId: SID_A });

        const stored = await repo.getMessages(SID_A);
        expect(stored?.[0]).toEqual({ role: "user", payload: { message: "hello" } });
    });

    test("GET messages returns the transcript after the agent finishes", async () => {
        await Bun.sleep(20);
        const res = await api(`/api/sessions/${SID_A}/messages`);
        expect(res.status).toBe(200);
        const body = await res.json() as { messages: Message[] };
        expect(body.messages).toEqual([
            { role: "user", payload: { message: "hello" } },
            { role: "assistant", payload: { type: "tool-call", id: "t1", name: "Read", input: { path: "x" } } },
            { role: "assistant", payload: { type: "text", message: "done" } },
        ]);
    });

    test("SSE streams tool-call and assistant-message events", async () => {
        const session = await repo.createSession(WID_A, "claude", "claude-sonnet-5");
        if (!session) throw new Error("session");
        claude.events = [
            { type: "tool-call", name: "Glob", input: { pattern: "*" } },
            { type: "done", ok: true, result: "ok" },
        ];

        const streamRes = await fetch(`${base}/api/sessions/${session.id}/events?token=${encodeURIComponent(token)}`);
        expect(streamRes.status).toBe(200);
        expect(streamRes.headers.get("content-type")).toContain("text/event-stream");

        const post = api(`/api/sessions/${session.id}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "ping" }),
        });

        const reader = streamRes.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const deadline = Date.now() + 2000;
        while (Date.now() < deadline && (!buf.includes("event: tool-call") || !buf.includes("event: assistant-message"))) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
        }
        await post;
        reader.cancel();

        expect(buf).toContain("event: tool-call");
        expect(buf).toContain("event: assistant-message");
        expect(buf).toContain("\"name\":\"Glob\"");
        expect(buf).toContain("\"message\":\"ok\"");
    });

    test("SSE 404s when the session does not exist", async () => {
        const res = await api(`/api/sessions/${SID_MISSING}/events`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "session not found" });
    });
});
