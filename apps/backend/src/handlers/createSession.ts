import { CreateSessionSchema, DEFAULT_MODEL_ID, PROVIDER_MODELS, type SessionCreatedSchemaType } from "commons";
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

    const providerId = parsed.data.provider;
    const provider = ctx.providers[providerId];
    if (!provider.isConfigured()) {
        throw new HttpError(400, provider.setupHint());
    }

    const catalog = PROVIDER_MODELS[providerId];
    if (parsed.data.model && !catalog.some((option) => option.id === parsed.data.model)) {
        throw new HttpError(400, `unknown model '${parsed.data.model}' for provider '${providerId}'`);
    }

    const model = parsed.data.model ?? DEFAULT_MODEL_ID[providerId];
    const session = await ctx.repo.createSession(workspaceId, providerId, model);
    if (!session) {
        throw new HttpError(404, "workspace not found");
    }

    return session;
}
