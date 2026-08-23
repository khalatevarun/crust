import type { ProviderId, SessionEvent } from "commons";
import { handleAddMessage, handleCreateSession, handleCreateWorkspace } from "../handlers";
import type { Provider } from "../providers/Provider";
import type { ChatRepository } from "../repository/ChatRepository";
import { corsHeaders, errorResponse, HttpError, isObjectId, json } from "./HttpError";
import { SessionHub } from "./SessionHub";

export type ServerDeps = {
    repo: ChatRepository;
    providers: Record<ProviderId, Provider>;
    hub: SessionHub;
    port?: number;
    hostname?: string;
};

async function readJson(req: Request): Promise<unknown> {
    const text = await req.text();
    if (!text.trim()) return {};
    try {
        return JSON.parse(text);
    } catch {
        throw new HttpError(400, "invalid json");
    }
}

function sseChunk(event: SessionEvent): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
}

const sseConnected = new TextEncoder().encode(": ok\n\n");

function optionsResponse(): Response {
    return new Response(null, { status: 204, headers: corsHeaders });
}

export function createServer(deps: ServerDeps) {
    const ctx = { repo: deps.repo, providers: deps.providers, hub: deps.hub };

    return Bun.serve({
        port: deps.port ?? 3001,
        hostname: deps.hostname ?? "localhost",
        routes: {
            "/api/workspaces": {
                OPTIONS: optionsResponse,
                POST: async (req) => {
                    try {
                        const body = await readJson(req);
                        const workspace = await handleCreateWorkspace(body, ctx);
                        return json(workspace, 201);
                    } catch (err) {
                        return errorResponse(err);
                    }
                },
            },
            "/api/workspaces/:workspaceId/sessions": {
                OPTIONS: optionsResponse,
                POST: async (req) => {
                    try {
                        const body = await readJson(req);
                        const session = await handleCreateSession(req.params.workspaceId, body, ctx);
                        return json(session, 201);
                    } catch (err) {
                        return errorResponse(err);
                    }
                },
            },
            "/api/sessions/:sessionId/messages": {
                OPTIONS: optionsResponse,
                GET: async (req) => {
                    try {
                        const sessionId = req.params.sessionId;
                        if (!isObjectId(sessionId)) {
                            throw new HttpError(400, "invalid sessionId format");
                        }
                        const messages = await deps.repo.getMessages(sessionId);
                        if (!messages) {
                            throw new HttpError(404, "session not found");
                        }
                        return json({ messages });
                    } catch (err) {
                        return errorResponse(err);
                    }
                },
                POST: async (req) => {
                    try {
                        const body = await readJson(req);
                        const result = await handleAddMessage(req.params.sessionId, body, ctx);
                        return json(result, 202);
                    } catch (err) {
                        return errorResponse(err);
                    }
                },
            },
            "/api/snapshot": {
                OPTIONS: optionsResponse,
                GET: async () => {
                    try {
                        const workspaces = await deps.repo.getSnapshotSummary();
                        return json({ workspaces });
                    } catch (err) {
                        return errorResponse(err);
                    }
                },
            },
            "/api/sessions/:sessionId/events": {
                OPTIONS: optionsResponse,
                GET: async (req) => {
                    try {
                        const sessionId = req.params.sessionId;
                        if (!isObjectId(sessionId)) {
                            throw new HttpError(400, "invalid sessionId format");
                        }
                        const messages = await deps.repo.getMessages(sessionId);
                        if (!messages) {
                            throw new HttpError(404, "session not found");
                        }

                        let unsubscribe = () => {};
                        const stream = new ReadableStream({
                            start(controller) {
                                controller.enqueue(sseConnected);
                                unsubscribe = deps.hub.subscribe(sessionId, (event) => {
                                    try {
                                        controller.enqueue(sseChunk(event));
                                    } catch {
                                        unsubscribe();
                                    }
                                });

                                req.signal.addEventListener("abort", () => {
                                    unsubscribe();
                                    try {
                                        controller.close();
                                    } catch {
                                        return;
                                    }
                                });
                            },
                            cancel() {
                                unsubscribe();
                            },
                        });

                        return new Response(stream, {
                            headers: {
                                ...corsHeaders,
                                "Content-Type": "text/event-stream",
                                "Cache-Control": "no-cache",
                                Connection: "keep-alive",
                            },
                        });
                    } catch (err) {
                        return errorResponse(err);
                    }
                },
            },
        },
    });
}
