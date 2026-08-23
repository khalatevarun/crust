import type { IncomingMessageType, OutgoingMessageType } from "commons";
import { WebSocket } from "ws";
import { dispatch } from "../handlers";
import type { ChatRepository } from "../repository/ChatRepository";
import type { AgentRunner } from "../agent/AgentRunner";

export class Connection {
    public readonly id: string;
    private readonly socket: WebSocket;
    private readonly repo: ChatRepository;
    private readonly agent: AgentRunner;

    constructor(id: string, socket: WebSocket, repo: ChatRepository, agent: AgentRunner) {
        this.id = id;
        this.socket = socket;
        this.repo = repo;
        this.agent = agent;
    }

    sendMessage(payload: OutgoingMessageType) {
        this.socket.send(JSON.stringify(payload));
    }

    async handleIncomingMessage(msg: IncomingMessageType): Promise<OutgoingMessageType> {
        return dispatch(msg, {
            repo: this.repo,
            agent: this.agent,
            sendMessage: (payload) => this.sendMessage(payload),
        });
    }
}
