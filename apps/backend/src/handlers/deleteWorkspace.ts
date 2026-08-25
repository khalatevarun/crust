import type { HandlerContext } from "./context";
import { HttpError, isObjectId } from "../http/HttpError";

export async function handleDeleteWorkspace(
    workspaceId: string,
    ctx: HandlerContext,
): Promise<void> {
    if (!isObjectId(workspaceId)) {
        throw new HttpError(400, "invalid workspaceId format");
    }

    const sessionIds = await ctx.repo.deleteWorkspace(workspaceId);
    if (sessionIds === null) {
        throw new HttpError(404, "workspace not found");
    }

    for (const sessionId of sessionIds) {
        ctx.hub.drop(sessionId);
    }
}
