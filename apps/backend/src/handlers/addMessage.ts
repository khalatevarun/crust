import { AddMessageSchema, type MessageAddedType } from "commons";
import type { HandlerContext } from "./context";
import { HttpError, isObjectId, zodErrorMessage } from "../http/HttpError";

export async function handleAddMessage(
    sessionId: string,
    payload: unknown,
    ctx: HandlerContext,
): Promise<MessageAddedType> {
    if (!isObjectId(sessionId)) {
        throw new HttpError(400, "invalid sessionId format");
    }

    const parsed = AddMessageSchema.safeParse(payload);
    if (!parsed.success) {
        throw new HttpError(400, zodErrorMessage(parsed.error));
    }

    const found = await ctx.repo.getSessionWithWorkspace(sessionId);
    if (!found) {
        throw new HttpError(404, "session not found");
    }

    await ctx.repo.appendUserMessage(sessionId, parsed.data.message);

    void runTurn({
        sessionId,
        message: parsed.data.message,
        ctx,
    }).catch((err) => {
        console.error("agent run failed", err);
    });

    return { sessionId };
}

async function runTurn(args: {
    sessionId: string;
    message: string;
    ctx: HandlerContext;
}): Promise<void> {
    const { sessionId, message, ctx } = args;
    const found = await ctx.repo.getSessionWithWorkspace(sessionId);
    if (!found) return;

    const provider = ctx.providers[found.session.provider];
    console.log("[agent] run", sessionId, found.session.provider, found.session.model);

    for await (const event of provider.run({
        prompt: message,
        cwd: found.workspace.path,
        resume: found.session.providerSessionId,
        model: found.session.model,
    })) {
        if (event.type === "tool-call") {
            ctx.hub.publish(sessionId, {
                type: "tool-call",
                payload: { sessionId, id: event.id, name: event.name, input: event.input },
            });
            await ctx.repo.appendToolCall(sessionId, { id: event.id, name: event.name, input: event.input });
        } else if (event.type === "done") {
            if (event.providerSessionId) {
                await ctx.repo.setProviderSessionId(sessionId, event.providerSessionId);
            }
            const text = event.ok ? event.result : event.errorMessage;
            if (text) {
                ctx.hub.publish(sessionId, {
                    type: "assistant-message",
                    payload: { sessionId, type: "text", message: text },
                });
                await ctx.repo.appendAssistantText(sessionId, text);
            } else if (!event.ok) {
                console.error("agent run finished without text", sessionId, event.errorMessage);
            }
        }
    }
}
