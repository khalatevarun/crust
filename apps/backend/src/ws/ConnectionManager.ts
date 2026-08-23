import { WebSocket } from "ws";
import { uuid } from "uuidv4";
import type { OutgoingMessageType } from "commons";
import { Connection } from "./Connection";
import { chatRepository } from "../repository/ChatRepository";
import { agentRunner } from "../agent/AgentRunner";

export class ConnectionManager {
    private connections: Connection[] = [];
    private static instance: ConnectionManager;

    private constructor() {}

    static getInstance(): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager();
        }
        return ConnectionManager.instance;
    }

    async addConnection(ws: WebSocket) {
        const id = uuid();
        const connection = new Connection(id, ws, chatRepository, agentRunner);
        this.connections.push(connection);

        // Buffer messages until init is sent so early creates aren't dropped
        // and aren't wiped by a stale init snapshot.
        const pending: WebSocket.RawData[] = [];
        let ready = false;

        const handleMessage = async (msg: WebSocket.RawData) => {
            try {
                const parsedMessage = JSON.parse(msg.toString());
                const responsePayload = await connection.handleIncomingMessage(parsedMessage);
                connection.sendMessage(responsePayload);
            } catch (e) {
                console.error("Error handling message", e);
                console.log(msg.toString());
            }
        };

        ws.on("message", async (msg) => {
            if (!ready) {
                pending.push(msg);
                return;
            }
            await handleMessage(msg);
        });

        ws.on("close", () => {
            this.connections = this.connections.filter((c) => c.id !== id);
        });

        const workspaces = await chatRepository.getSnapshot();

        ws.send(
            JSON.stringify({
                type: "init",
                workspaces,
            } satisfies OutgoingMessageType)
        );

        ready = true;
        for (const msg of pending) {
            await handleMessage(msg);
        }
    }
}
