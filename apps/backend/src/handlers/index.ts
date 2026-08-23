import type { IncomingMessageType, OutgoingMessageType } from "commons";
import type { HandlerContext } from "./context";
import { handleCreateWorkspace } from "./createWorkspace";
import { handleCreateSession } from "./createSession";
import { handleAddMessage } from "./addMessage";

export async function dispatch(msg: IncomingMessageType, ctx: HandlerContext): Promise<OutgoingMessageType> {
    switch (msg.type) {
        case "create-workspace":
            return handleCreateWorkspace(msg.payload, ctx);
        case "create-session":
            return handleCreateSession(msg.payload, ctx);
        case "add-message":
            return handleAddMessage(msg.payload, ctx);
        default: {
            const _exhaustive: never = msg;
            throw new Error("Incorrect Input Schema");
        }
    }
}

export type { HandlerContext };
