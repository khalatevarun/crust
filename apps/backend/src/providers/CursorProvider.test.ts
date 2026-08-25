import { expect, test } from "bun:test";
import type { CursorAgentHandle } from "./CursorProvider";
import { CursorProvider, resetCursorAgentsForTests } from "./CursorProvider";

function fakeAgent(
    id: string,
    streamEvents: Array<{
        type: string;
        status?: string;
        call_id?: string;
        name?: string;
        args?: unknown;
    }> = [],
): CursorAgentHandle & { sendCount: number } {
    const handle = {
        agentId: id,
        sendCount: 0,
        async send() {
            handle.sendCount += 1;
            return {
                stream: async function* () {
                    yield* streamEvents;
                },
                wait: async () => ({ status: "finished", result: "ok" }),
            };
        },
    };
    return handle;
}

test("first cursor turn creates an agent and a follow-up send reuses the live handle", async () => {
    resetCursorAgentsForTests();
    const first = fakeAgent("agent-1");
    let createdWith: unknown;
    let resumeCalls = 0;
    const provider = new CursorProvider({
        async create(options) {
            createdWith = options;
            return first;
        },
        async resume() {
            resumeCalls += 1;
            return fakeAgent("should-not-resume");
        },
    });

    for await (const event of provider.run({
        prompt: "hello",
        cwd: "/tmp/ws",
        model: "composer-2.5",
    })) {
        if (event.type === "done") expect(event.providerSessionId).toBe("agent-1");
    }
    expect(createdWith).toEqual({
        model: { id: "composer-2.5" },
        local: { cwd: "/tmp/ws" },
    });
    expect(resumeCalls).toBe(0);
    expect(first.sendCount).toBe(1);

    for await (const event of provider.run({
        prompt: "follow up",
        cwd: "/tmp/ws",
        model: "composer-2.5",
        resume: "agent-1",
    })) {
        expect(event.type).toBe("done");
    }
    expect(resumeCalls).toBe(0);
    expect(first.sendCount).toBe(2);
});

test("cursor resumes from disk when the live handle is gone", async () => {
    resetCursorAgentsForTests();
    const resumed = fakeAgent("agent-1");
    let createCalls = 0;
    let resumedId: string | undefined;
    let resumedWith: unknown;
    const provider = new CursorProvider({
        async create() {
            createCalls += 1;
            return fakeAgent("fresh");
        },
        async resume(id, options) {
            resumedId = id;
            resumedWith = options;
            return resumed;
        },
    });

    for await (const event of provider.run({
        prompt: "continue",
        cwd: "/tmp/ws",
        model: "composer-2.5",
        resume: "agent-1",
    })) {
        if (event.type === "done") expect(event.providerSessionId).toBe("agent-1");
    }

    expect(createCalls).toBe(0);
    expect(resumedId).toBe("agent-1");
    expect(resumedWith).toEqual({
        model: { id: "composer-2.5" },
        local: { cwd: "/tmp/ws" },
    });
    expect(resumed.sendCount).toBe(1);
});

test("cursor yields a tool-call for running or completed-only stream events, once per call id", async () => {
    resetCursorAgentsForTests();
    const agent = fakeAgent("agent-2", [
        { type: "tool_call", status: "running", call_id: "c1", name: "ReadFile", args: { path: "a.ts" } },
        { type: "tool_call", status: "completed", call_id: "c1", name: "ReadFile", args: { path: "a.ts" } },
        { type: "tool_call", status: "completed", call_id: "c2", name: "EditFile", args: { path: "b.ts" } },
    ]);
    const provider = new CursorProvider({
        async create() {
            return agent;
        },
        async resume() {
            return fakeAgent("unused");
        },
    });

    const events = [];
    for await (const event of provider.run({
        prompt: "edit",
        cwd: "/tmp/ws",
        model: "composer-2.5",
    })) {
        events.push(event);
    }

    expect(events).toEqual([
        { type: "tool-call", id: "c1", name: "ReadFile", input: { path: "a.ts" } },
        { type: "tool-call", id: "c2", name: "EditFile", input: { path: "b.ts" } },
        { type: "done", ok: true, result: "ok", providerSessionId: "agent-2", errorMessage: undefined },
    ]);
});
