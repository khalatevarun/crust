import type { ChatRepository } from "../repository/ChatRepository";
import type { SessionHub } from "../http/SessionHub";
import type { Provider } from "../providers/Provider";
import type { ProviderId } from "commons";

export type HandlerContext = {
    repo: ChatRepository;
    hub: SessionHub;
    providers: Record<ProviderId, Provider>;
};
