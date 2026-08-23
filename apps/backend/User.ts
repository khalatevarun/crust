import { AddMessageSchema, CreateSessionSchema, CreateWorkspaceSchema, type IncomingMessageType, type OutgoingMessageType } from "commons";
import { Session, SessionModel, WorkspaceModel } from "db";
import { WebSocket } from "ws";
import { query } from "@anthropic-ai/claude-agent-sdk";


export class User {
    private socket: WebSocket;
    public id: string;
    constructor(id: string, socket: WebSocket) {
        this.socket = socket
        this.id = id;
    }

    async sendMessage(payload: OutgoingMessageType) {
        this.socket.send(JSON.stringify(payload))
    }

    async handleIncomingMessage(msg: IncomingMessageType): Promise<OutgoingMessageType> {
        if (msg.type == "create-workspace") {
            const { success, data } = CreateWorkspaceSchema.safeParse(msg.payload);
            if (!success) {
                throw new Error("incorrect schema");
            }

            const name: string = data.path.split("/").pop()!;

            const workspace = await WorkspaceModel.create({
                path: data.path,
                name
            })

            return {
                type: "workspace-created",
                payload: {
                    id: workspace._id.toString(),
                    name,
                    path: data.path
                }
            }

        }

        if (msg.type == "create-session") {
            const { success, data } = CreateSessionSchema.safeParse(msg.payload);
            if (!success) {
                throw new Error("incorrect schema");
            }

            const session = await SessionModel.create({
                workspaceId: data.workspaceId,
                conversation: []
            })

            return {
                type: "create-session",
                payload: { id: session._id.toString(), workspaceId: data.workspaceId }
            }

        }

        if (msg.type === "add-message") {
            const { success, data } = AddMessageSchema.safeParse(msg.payload);
            if (!success) {
                throw new Error("incorrect schema");
            }

            await SessionModel.updateOne({
                _id: data.sessionId

            }, {
                $push: {
                    conversation: {
                        role: "user",
                        payload: {
                            message: data.message
                        }
                    }
                }
            })


            const session = await SessionModel.findById(data.sessionId)
            const workspace = await WorkspaceModel.findOne({
                _id: session?.workspaceId
            })

            if (!session) {
                throw new Error("session does not exist " + data.sessionId)
            }

            if (!workspace) {
                throw new Error("workspace does not exist " + session?.workspaceId)
            }



            // if (!session.messages.length == 0) {
            // }


            // Agentic loop: streams messages as Claude works
            for await (const message of query({
                prompt: msg.payload.message,
                options: {
                    cwd: workspace.path!,
                    allowedTools: ["Read", "Edit", "Glob"], // Auto-approve these tools
                    permissionMode: "acceptEdits", // Auto-approve file edits
                    resume: session.anthropicSessionId ?? undefined
                }
            })) {
                if (message.type === "assistant" && message.message?.content) {
                    for (const block of message.message.content) {
                        if ("text" in block) {
                            console.log(block.text);
                        } else if ("name" in block) {
                            const toolName = block.name;
                            const toolInput = "input" in block ? block.input : undefined;
                            const toolId = "id" in block && typeof block.id === "string" ? block.id : undefined;
                            console.log(`Tool: ${toolName}`);

                            const entry = {
                                role: "assistant" as const,
                                payload: {
                                    type: "tool-call" as const,
                                    id: toolId,
                                    name: toolName,
                                    input: toolInput,
                                }
                            };

                            this.sendMessage({
                                type: "tool-call",
                                payload: {
                                    sessionId: data.sessionId,
                                    id: toolId,
                                    name: toolName,
                                    input: toolInput,
                                }
                            })

                            await SessionModel.updateOne({
                                _id: data.sessionId
                            }, {
                                $push: {
                                    conversation: entry
                                }
                            })
                        }
                    }
                } else if (message.type === "result") {
                    console.log(`Done: ${message.subtype}`); // Final result
                    if (!session.anthropicSessionId) {
                        session.anthropicSessionId = message.session_id;
                        await session.save()
                    }

                    if (message.subtype === "success") {
                        this.sendMessage({
                            type: "assistant-message",
                            payload: {
                                sessionId: data.sessionId,
                                type: "text",
                                message: message.result
                            }
                        })

                        await SessionModel.updateOne({
                            _id: data.sessionId

                        }, {
                            $push: {
                                conversation: {
                                    role: "assistant",
                                    payload: {
                                        type: "text",
                                        message: message.result
                                    }
                                }
                            }
                        })
                    }
                }
            }

            return {
                type: "add-message",
                payload: { id: data.sessionId }
            }

        }
        throw new Error("Incorrect Input Schema");

    }
}