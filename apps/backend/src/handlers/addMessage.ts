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
        session: found.session,
        workspace: found.workspace,
        ctx,
    }).catch((err) => {
        console.error("agent run failed", err);
    });

    return { sessionId };
}

async function runTurn(args: {
    sessionId: string;
    message: string;
    session: { anthropicSessionId?: string };
    workspace: { path: string };
    ctx: HandlerContext;
}): Promise<void> {
    const { sessionId, message, session, workspace, ctx } = args;

    for await (const event of ctx.agent.run({
        prompt: message,
        cwd: workspace.path,
        resume: session.anthropicSessionId,
    })) {
        if (event.type === "tool-call") {
            ctx.hub.publish(sessionId, {
                type: "tool-call",
                payload: { sessionId, id: event.id, name: event.name, input: event.input },
            });
            await ctx.repo.appendToolCall(sessionId, { id: event.id, name: event.name, input: event.input });
        } else if (event.type === "done") {
            if (!session.anthropicSessionId && event.anthropicSessionId) {
                await ctx.repo.setAnthropicSessionId(sessionId, event.anthropicSessionId);
            }
            if (event.subtype === "success" && event.result) {
                ctx.hub.publish(sessionId, {
                    type: "assistant-message",
                    payload: { sessionId, type: "text", message: event.result },
                });
                await ctx.repo.appendAssistantText(sessionId, event.result);
            }
        }
    }
}
