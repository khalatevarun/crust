import { AddMessageSchema, type OutgoingMessageType } from "commons";
import type { HandlerContext } from "./context";

export async function handleAddMessage(payload: unknown, ctx: HandlerContext): Promise<OutgoingMessageType> {
    const { success, data } = AddMessageSchema.safeParse(payload);
    if (!success) {
        throw new Error("incorrect schema");
    }

    await ctx.repo.appendUserMessage(data.sessionId, data.message);

    const found = await ctx.repo.getSessionWithWorkspace(data.sessionId);
    if (!found) {
        throw new Error("session does not exist " + data.sessionId);
    }
    const { session, workspace } = found;

    for await (const event of ctx.agent.run({
        prompt: data.message,
        cwd: workspace.path,
        resume: session.anthropicSessionId,
    })) {
        if (event.type === "tool-call") {
            ctx.sendMessage({
                type: "tool-call",
                payload: { sessionId: data.sessionId, id: event.id, name: event.name, input: event.input },
            });
            await ctx.repo.appendToolCall(data.sessionId, { id: event.id, name: event.name, input: event.input });
        } else if (event.type === "done") {
            if (!session.anthropicSessionId && event.anthropicSessionId) {
                await ctx.repo.setAnthropicSessionId(data.sessionId, event.anthropicSessionId);
            }
            if (event.subtype === "success" && event.result) {
                ctx.sendMessage({
                    type: "assistant-message",
                    payload: { sessionId: data.sessionId, type: "text", message: event.result },
                });
                await ctx.repo.appendAssistantText(data.sessionId, event.result);
            }
        }
    }

    return {
        type: "add-message",
        payload: { id: data.sessionId },
    };
}
