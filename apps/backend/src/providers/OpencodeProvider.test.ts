import { expect, test } from "bun:test";
import { OpencodeProvider, resetOpencodeServerForTests } from "./OpencodeProvider";

test("opencode starts the server once and prompts the same session id on follow-up", async () => {
    resetOpencodeServerForTests();
    let startCalls = 0;
    let closeCalls = 0;
    let createCalls = 0;
    const prompts: unknown[] = [];

    const provider = new OpencodeProvider(
        async () => {
            startCalls += 1;
            return {
                server: {
                    url: "http://127.0.0.1:9",
                    close() {
                        closeCalls += 1;
                    },
                },
            };
        },
        () => ({
            session: {
                async create() {
                    createCalls += 1;
                    return { data: { id: "ses-1" } };
                },
                async prompt(args) {
                    prompts.push(args);
                    return { data: { text: "ok" } };
                },
            },
            event: {
                async subscribe() {
                    return {
                        stream: (async function* () {
                            yield { type: "session.idle" };
                        })(),
                    };
                },
            },
        }),
    );

    for await (const event of provider.run({
        prompt: "hello",
        cwd: "/tmp/ws",
        model: "kimi-k2",
    })) {
        if (event.type === "done") expect(event.providerSessionId).toBe("ses-1");
    }
    expect(startCalls).toBe(1);
    expect(createCalls).toBe(1);
    expect(closeCalls).toBe(0);

    for await (const event of provider.run({
        prompt: "follow up",
        cwd: "/tmp/ws",
        model: "kimi-k2",
        resume: "ses-1",
    })) {
        if (event.type === "done") expect(event.providerSessionId).toBe("ses-1");
    }
    expect(startCalls).toBe(1);
    expect(createCalls).toBe(1);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toEqual({
        path: { id: "ses-1" },
        body: {
            model: { providerID: "opencode", modelID: "kimi-k2" },
            parts: [{ type: "text", text: "follow up" }],
        },
    });
    expect(closeCalls).toBe(0);
});

test("opencode-default omits model so the server uses its own default", async () => {
    resetOpencodeServerForTests();
    const prompts: unknown[] = [];
    const provider = new OpencodeProvider(
        async () => ({
            server: { url: "http://127.0.0.1:9", close() {} },
        }),
        () => ({
            session: {
                async create() {
                    return { data: { id: "ses-2" } };
                },
                async prompt(args) {
                    prompts.push(args);
                    return { data: { text: "ok" } };
                },
            },
            event: {
                async subscribe() {
                    return { stream: (async function* () {})() };
                },
            },
        }),
    );

    for await (const event of provider.run({
        prompt: "hello",
        cwd: "/tmp/ws",
        model: "opencode-default",
    })) {
        expect(event.type).toBe("done");
    }
    expect(prompts[0]).toEqual({
        path: { id: "ses-2" },
        body: {
            parts: [{ type: "text", text: "hello" }],
        },
    });
});

test("opencode yields live tool-call events from message.part.updated", async () => {
    resetOpencodeServerForTests();
    const order: string[] = [];
    const provider = new OpencodeProvider(
        async () => ({
            server: { url: "http://127.0.0.1:9", close() {} },
        }),
        () => ({
            session: {
                async create() {
                    return { data: { id: "ses-3" } };
                },
                async prompt() {
                    order.push("prompt");
                    await Bun.sleep(20);
                    return { data: { text: "done" } };
                },
            },
            event: {
                async subscribe() {
                    order.push("subscribe");
                    return {
                        stream: (async function* () {
                            yield {
                                type: "message.part.updated",
                                properties: {
                                    part: {
                                        id: "part-1",
                                        sessionID: "ses-3",
                                        type: "tool",
                                        callID: "call-1",
                                        tool: "read",
                                        state: {
                                            status: "running",
                                            input: { path: "src/a.ts" },
                                        },
                                    },
                                },
                            };
                            yield {
                                type: "message.part.updated",
                                properties: {
                                    part: {
                                        id: "part-1",
                                        sessionID: "ses-3",
                                        type: "tool",
                                        callID: "call-1",
                                        tool: "read",
                                        state: {
                                            status: "completed",
                                            input: { path: "src/a.ts" },
                                        },
                                    },
                                },
                            };
                            yield { type: "session.idle", properties: { sessionID: "ses-3" } };
                        })(),
                    };
                },
            },
        }),
    );

    const events = [];
    for await (const event of provider.run({
        prompt: "read the file",
        cwd: "/tmp/ws",
        model: "opencode-default",
    })) {
        events.push(event);
    }

    expect(order).toEqual(["subscribe", "prompt"]);
    expect(events).toEqual([
        { type: "tool-call", id: "call-1", name: "read", input: { path: "src/a.ts" } },
        { type: "done", ok: true, result: "done", providerSessionId: "ses-3", errorMessage: undefined },
    ]);
});

test("opencode waits for tool input instead of publishing the empty pending part", async () => {
    resetOpencodeServerForTests();
    const provider = new OpencodeProvider(
        async () => ({
            server: { url: "http://127.0.0.1:9", close() {} },
        }),
        () => ({
            session: {
                async create() {
                    return { data: { id: "ses-6" } };
                },
                async prompt() {
                    await Bun.sleep(20);
                    return { data: { text: "ok" } };
                },
            },
            event: {
                async subscribe() {
                    return {
                        stream: (async function* () {
                            yield {
                                type: "message.part.updated",
                                properties: {
                                    part: {
                                        sessionID: "ses-6",
                                        type: "tool",
                                        callID: "call-2",
                                        tool: "read",
                                        state: { status: "pending", input: {}, raw: "" },
                                    },
                                },
                            };
                            yield {
                                type: "message.part.updated",
                                properties: {
                                    part: {
                                        sessionID: "ses-6",
                                        type: "tool",
                                        callID: "call-2",
                                        tool: "read",
                                        state: { status: "pending", input: {}, raw: '{"filePath":"src/a.ts"}' },
                                    },
                                },
                            };
                            yield {
                                type: "message.part.updated",
                                properties: {
                                    part: {
                                        sessionID: "ses-6",
                                        type: "tool",
                                        callID: "call-2",
                                        tool: "read",
                                        state: {
                                            status: "running",
                                            input: { filePath: "src/a.ts" },
                                            title: "src/a.ts",
                                        },
                                    },
                                },
                            };
                            yield { type: "session.idle", properties: { sessionID: "ses-6" } };
                        })(),
                    };
                },
            },
        }),
    );

    const events = [];
    for await (const event of provider.run({
        prompt: "read it",
        cwd: "/tmp/ws",
        model: "opencode-default",
    })) {
        events.push(event);
    }

    expect(events).toEqual([
        { type: "tool-call", id: "call-2", name: "read", input: { filePath: "src/a.ts" } },
        { type: "done", ok: true, result: "ok", providerSessionId: "ses-6", errorMessage: undefined },
    ]);
});

test("opencode finishes when prompt resolves even if the event stream never goes idle", async () => {
    resetOpencodeServerForTests();
    const provider = new OpencodeProvider(
        async () => ({
            server: { url: "http://127.0.0.1:9", close() {} },
        }),
        () => ({
            session: {
                async create() {
                    return { data: { id: "ses-4" } };
                },
                async prompt() {
                    return {
                        data: {
                            parts: [
                                {
                                    type: "tool",
                                    callID: "call-9",
                                    tool: "glob",
                                    state: { status: "completed", input: { pattern: "*.ts" } },
                                },
                                { type: "text", text: "found 2 files" },
                            ],
                        },
                    };
                },
            },
            event: {
                async subscribe(options) {
                    return {
                        stream: (async function* () {
                            await new Promise<void>((resolve) => {
                                options?.signal?.addEventListener("abort", () => resolve(), { once: true });
                            });
                        })(),
                    };
                },
            },
        }),
    );

    const events = [];
    for await (const event of provider.run({
        prompt: "find files",
        cwd: "/tmp/ws",
        model: "kimi-k2",
    })) {
        events.push(event);
    }

    expect(events).toEqual([
        { type: "tool-call", id: "call-9", name: "glob", input: { pattern: "*.ts" } },
        {
            type: "done",
            ok: true,
            result: "found 2 files",
            providerSessionId: "ses-4",
            errorMessage: undefined,
        },
    ]);
});

test("opencode ignores tool parts from other sessions", async () => {
    resetOpencodeServerForTests();
    const provider = new OpencodeProvider(
        async () => ({
            server: { url: "http://127.0.0.1:9", close() {} },
        }),
        () => ({
            session: {
                async create() {
                    return { data: { id: "ses-5" } };
                },
                async prompt() {
                    await Bun.sleep(10);
                    return { data: { text: "ok" } };
                },
            },
            event: {
                async subscribe() {
                    return {
                        stream: (async function* () {
                            yield {
                                type: "message.part.updated",
                                properties: {
                                    part: {
                                        sessionID: "other",
                                        type: "tool",
                                        callID: "call-x",
                                        tool: "bash",
                                        state: { status: "running", input: { command: "ls" } },
                                    },
                                },
                            };
                            yield { type: "session.idle", properties: { sessionID: "ses-5" } };
                        })(),
                    };
                },
            },
        }),
    );

    const events = [];
    for await (const event of provider.run({
        prompt: "hello",
        cwd: "/tmp/ws",
        model: "kimi-k2",
    })) {
        events.push(event);
    }

    expect(events).toEqual([
        { type: "done", ok: true, result: "ok", providerSessionId: "ses-5", errorMessage: undefined },
    ]);
});
