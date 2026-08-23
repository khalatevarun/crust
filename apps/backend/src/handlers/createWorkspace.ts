import { CreateWorkspaceSchema, type OutgoingMessageType } from "commons";
import type { HandlerContext } from "./context";

export async function handleCreateWorkspace(payload: unknown, ctx: HandlerContext): Promise<OutgoingMessageType> {
    const { success, data } = CreateWorkspaceSchema.safeParse(payload);
    if (!success) {
        throw new Error("incorrect schema");
    }

    const workspace = await ctx.repo.createWorkspace(data.path);

    return {
        type: "workspace-created",
        payload: workspace,
    };
}
