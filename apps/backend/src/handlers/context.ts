import type { OutgoingMessageType } from "commons";
import type { ChatRepository } from "../repository/ChatRepository";
import type { AgentRunner } from "../agent/AgentRunner";

export type HandlerContext = {
    repo: ChatRepository;
    agent: AgentRunner;
    sendMessage: (payload: OutgoingMessageType) => void;
};
