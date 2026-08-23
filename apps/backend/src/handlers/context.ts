import type { ChatRepository } from "../repository/ChatRepository";
import type { AgentRunner } from "../agent/AgentRunner";
import type { SessionHub } from "../http/SessionHub";

export type HandlerContext = {
    repo: ChatRepository;
    agent: AgentRunner;
    hub: SessionHub;
};
