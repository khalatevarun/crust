import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Message, WorkspaceSummary } from "commons";
import type { AgentEvent, AgentRunOptions } from "../agent/AgentRunner";
import type { ToolCall, SessionRecord, WorkspaceRecord } from "../repository/ChatRepository";
import { SessionHub } from "./SessionHub";
import { createServer } from "./server";

const WID_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const WID_MISSING = "bbbbbbbbbbbbbbbbbbbbbbbb";
const SID_A = "cccccccccccccccccccccccc";
const SID_MISSING = "dddddddddddddddddddddddd";

class MemoryRepo {
    workspaces = new Map<string, { id: string; name: string; path: string }>();
    sessions = new Map<string, { id: string; workspaceId: string; messages: Message[]; anthropicSessionId?: string }>();
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

    async createSession(workspaceId: string) {
        if (!this.workspaces.has(workspaceId)) return null;
        const id = this.nextSession === 0 ? SID_A : idFromCounter(this.nextSession, "c");
        this.nextSession += 1;
        this.sessions.set(id, { id, workspaceId, messages: [] });
        return { id, workspaceId };
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

    async setAnthropicSessionId(sessionId: string, anthropicSessionId: string) {
        const session = this.sessions.get(sessionId);
        if (session) session.anthropicSessionId = anthropicSessionId;
    }

    async getSessionWithWorkspace(
        sessionId: string,
    ): Promise<{ session: SessionRecord; workspace: WorkspaceRecord } | null> {
        const session = this.sessions.get(sessionId);
        if (!session) return null;
        const workspace = this.workspaces.get(session.workspaceId);
        if (!workspace) return null;
        return {
            session: { id: session.id, anthropicSessionId: session.anthropicSessionId },
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

class FakeAgent {
    events: AgentEvent[] = [];

    async *run(_options: AgentRunOptions): AsyncGenerator<AgentEvent> {
        for (const event of this.events) {
            yield event;
        }
    }
}

describe("http api", () => {
    const repo = new MemoryRepo();
    const agent = new FakeAgent();
    const hub = new SessionHub();
    let server: ReturnType<typeof createServer>;
    let base: string;

    beforeAll(() => {
        server = createServer({
            repo: repo as never,
            agent: agent as never,
            hub,
            port: 0,
            hostname: "127.0.0.1",
        });
        base = `http://${server.hostname}:${server.port}`;
    });

    afterAll(() => {
        server.stop(true);
    });

    test("POST /api/workspaces creates a workspace", async () => {
        const res = await fetch(`${base}/api/workspaces`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: "/tmp/demo" }),
        });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body).toEqual({ id: WID_A, name: "demo", path: "/tmp/demo" });
    });

    test("POST /api/workspaces rejects invalid body", async () => {
        const res = await fetch(`${base}/api/workspaces`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error.length).toBeGreaterThan(0);
    });

    test("GET /api/snapshot returns metadata only", async () => {
        const res = await fetch(`${base}/api/snapshot`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({
            workspaces: [{ id: WID_A, name: "demo", path: "/tmp/demo", sessions: [] }],
        });
    });

    test("POST session returns 400 for bad id format and 404 when missing", async () => {
        const bad = await fetch(`${base}/api/workspaces/not-an-id/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(bad.status).toBe(400);

        const missing = await fetch(`${base}/api/workspaces/${WID_MISSING}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(missing.status).toBe(404);
        expect(await missing.json()).toEqual({ error: "workspace not found" });
    });

    test("POST session creates a session", async () => {
        const res = await fetch(`${base}/api/workspaces/${WID_A}/sessions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ id: SID_A, workspaceId: WID_A });
    });

    test("GET messages 404s for unknown session", async () => {
        const res = await fetch(`${base}/api/sessions/${SID_MISSING}/messages`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "session not found" });
    });

    test("POST message returns 202 and persists the user turn without waiting for the agent", async () => {
        agent.events = [
            { type: "tool-call", id: "t1", name: "Read", input: { path: "x" } },
            { type: "done", subtype: "success", result: "done", anthropicSessionId: "prov-1" },
        ];

        const res = await fetch(`${base}/api/sessions/${SID_A}/messages`, {
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
        const res = await fetch(`${base}/api/sessions/${SID_A}/messages`);
        expect(res.status).toBe(200);
        const body = await res.json() as { messages: Message[] };
        expect(body.messages).toEqual([
            { role: "user", payload: { message: "hello" } },
            { role: "assistant", payload: { type: "tool-call", id: "t1", name: "Read", input: { path: "x" } } },
            { role: "assistant", payload: { type: "text", message: "done" } },
        ]);
    });

    test("SSE streams tool-call and assistant-message events", async () => {
        const session = await repo.createSession(WID_A);
        if (!session) throw new Error("session");
        agent.events = [
            { type: "tool-call", name: "Glob", input: { pattern: "*" } },
            { type: "done", subtype: "success", result: "ok" },
        ];

        const streamRes = await fetch(`${base}/api/sessions/${session.id}/events`);
        expect(streamRes.status).toBe(200);
        expect(streamRes.headers.get("content-type")).toContain("text/event-stream");

        const post = fetch(`${base}/api/sessions/${session.id}/messages`, {
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
        const res = await fetch(`${base}/api/sessions/${SID_MISSING}/events`);
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "session not found" });
    });
});
