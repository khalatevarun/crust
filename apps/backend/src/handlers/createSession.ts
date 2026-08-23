import { CreateSessionSchema, type OutgoingMessageType } from "commons";
import type { HandlerContext } from "./context";

export async function handleCreateSession(payload: unknown, ctx: HandlerContext): Promise<OutgoingMessageType> {
    const { success, data } = CreateSessionSchema.safeParse(payload);
    if (!success) {
        throw new Error("incorrect schema");
    }

    const session = await ctx.repo.createSession(data.workspaceId);

    return {
        type: "create-session",
        payload: session,
    };
}
