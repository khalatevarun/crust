import { CreateSessionSchema, type SessionCreatedSchemaType } from "commons";
import type { HandlerContext } from "./context";
import { HttpError, isObjectId, zodErrorMessage } from "../http/HttpError";

export async function handleCreateSession(
    workspaceId: string,
    payload: unknown,
    ctx: HandlerContext,
): Promise<SessionCreatedSchemaType> {
    if (!isObjectId(workspaceId)) {
        throw new HttpError(400, "invalid workspaceId format");
    }

    const parsed = CreateSessionSchema.safeParse(payload);
    if (!parsed.success) {
        throw new HttpError(400, zodErrorMessage(parsed.error));
    }

    const session = await ctx.repo.createSession(workspaceId);
    if (!session) {
        throw new HttpError(404, "workspace not found");
    }

    return session;
}
