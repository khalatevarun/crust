import { CreateWorkspaceSchema, type WorkspaceCreatedSchemaType } from "commons";
import type { HandlerContext } from "./context";
import { HttpError, zodErrorMessage } from "../http/HttpError";

export async function handleCreateWorkspace(
    payload: unknown,
    ctx: HandlerContext,
): Promise<WorkspaceCreatedSchemaType> {
    const parsed = CreateWorkspaceSchema.safeParse(payload);
    if (!parsed.success) {
        throw new HttpError(400, zodErrorMessage(parsed.error));
    }

    return ctx.repo.createWorkspace(parsed.data.path);
}
