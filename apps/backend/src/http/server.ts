import type { ProviderId, SessionEvent } from "commons";
import { handleAddMessage, handleCreateSession, handleCreateWorkspace, handleDeleteWorkspace } from "../handlers";
import { handleDeleteDevice, handleListDevices, handlePairDevice } from "../handlers/devices";
import { authenticateRequest } from "./auth";
import type { Provider } from "../providers/Provider";
import type { ChatRepository } from "../repository/ChatRepository";
import type { DeviceRepository } from "../repository/DeviceRepository";
import { resolveAdvertisedOrigin, type AdvertisedOrigin } from "./advertisedUrl";
import { corsHeaders, errorResponse, HttpError, isObjectId, json } from "./HttpError";
import { SessionHub } from "./SessionHub";

export type ServerDeps = {
    repo: ChatRepository;
    providers: Record<ProviderId, Provider>;
    hub: SessionHub;
    devices: DeviceRepository;
    port?: number;
    hostname?: string;
    resolveOrigin?: (args: { port: number }) => Promise<AdvertisedOrigin>;
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

function empty(status: number): Response {
    return new Response(null, { status, headers: corsHeaders });
}

export function createServer(deps: ServerDeps) {
    const ctx = { repo: deps.repo, providers: deps.providers, hub: deps.hub };

    async function requireAuth(req: Request, allowQueryToken = false) {
        await authenticateRequest(req, deps.devices, allowQueryToken);
    }

    return Bun.serve({
        port: deps.port ?? 3001,
        hostname: deps.hostname ?? "0.0.0.0",
        routes: {
            "/api/devices/pair": {
                OPTIONS: optionsResponse,
                POST: async (req) => {
                    try {
                        const body = await readJson(req);
                        const device = await handlePairDevice(req, body, deps.devices);
                        const port = deps.port ?? 3001;
                        const origin = await (deps.resolveOrigin ?? resolveAdvertisedOrigin)({ port });
                        return json({
                            ...device,
                            backendUrl: origin.url,
                            originKind: origin.kind,
                        }, 201);
                    } catch (err) {
                        return errorResponse(err);
                    }
                },
            },
            "/api/devices": {
                OPTIONS: optionsResponse,
                GET: async (req) => {
                    try {
                        await requireAuth(req);
                        return json(await handleListDevices(deps.devices));
                    } catch (err) {
                        return errorResponse(err);
                    }
                },
            },
            "/api/devices/:id": {
                OPTIONS: optionsResponse,
                DELETE: async (req) => {
                    try {
                        await requireAuth(req);
                        const id = req.params.id;
                        if (!isObjectId(id)) {
                            throw new HttpError(400, "invalid device id");
                        }
                        await handleDeleteDevice(id, deps.devices);
                        return empty(204);
                    } catch (err) {
                        return errorResponse(err);
                    }
                },
            },
            "/api/workspaces": {
                OPTIONS: optionsResponse,
                POST: async (req) => {
                    try {
                        await requireAuth(req);
                        const body = await readJson(req);
                        const workspace = await handleCreateWorkspace(body, ctx);
                        return json(workspace, 201);
                    } catch (err) {
                        return errorResponse(err);
                    }
                },
            },
            "/api/workspaces/:workspaceId": {
                OPTIONS: optionsResponse,
                DELETE: async (req) => {
                    try {
                        await requireAuth(req);
                        await handleDeleteWorkspace(req.params.workspaceId, ctx);
                        return empty(204);
                    } catch (err) {
                        return errorResponse(err);
                    }
                },
            },
            "/api/workspaces/:workspaceId/sessions": {
                OPTIONS: optionsResponse,
                POST: async (req) => {
                    try {
                        await requireAuth(req);
                        const body = await readJson(req);
                        console.log("[http] POST session", req.params.workspaceId, body);
                        const session = await handleCreateSession(req.params.workspaceId, body, ctx);
                        console.log("[http] POST session 201", session.id, session.provider, session.model);
                        return json(session, 201);
                    } catch (err) {
                        console.error("[http] POST session failed", err instanceof Error ? err.message : err);
                        return errorResponse(err);
                    }
                },
            },
            "/api/sessions/:sessionId/messages": {
                OPTIONS: optionsResponse,
                GET: async (req) => {
                    try {
                        await requireAuth(req);
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
                        await requireAuth(req);
                        const body = await readJson(req);
                        console.log("[http] POST message", req.params.sessionId);
                        const result = await handleAddMessage(req.params.sessionId, body, ctx);
                        return json(result, 202);
                    } catch (err) {
                        console.error("[http] POST message failed", err instanceof Error ? err.message : err);
                        return errorResponse(err);
                    }
                },
            },
            "/api/snapshot": {
                OPTIONS: optionsResponse,
                GET: async (req) => {
                    try {
                        await requireAuth(req);
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
                        await requireAuth(req, true);
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
