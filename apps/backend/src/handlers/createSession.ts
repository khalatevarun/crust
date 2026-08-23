import { CreateSessionSchema, type SessionCreatedSchemaType } from "commons";
import type { HandlerContext } from "./context";
import { HttpError, isObjectId, zodErrorMessage } from "../http/HttpError";
import { PROVIDER_CREDENTIAL } from "../providers/registry";

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

    const provider = ctx.providers[parsed.data.provider];
    if (!provider.isConfigured()) {
        throw new HttpError(
            400,
            `${parsed.data.provider} is not configured: missing ${PROVIDER_CREDENTIAL[parsed.data.provider]}`,
        );
    }

    const session = await ctx.repo.createSession(workspaceId, parsed.data.provider);
    if (!session) {
        throw new HttpError(404, "workspace not found");
    }

    return session;
}
