import { WorkspaceModel, SessionModel } from "db";
import type { Message, Workspace, WorkspaceSummary } from "commons";

export type ToolCall = {
    id?: string;
    name: string;
    input?: unknown;
};

export type SessionRecord = {
    id: string;
    anthropicSessionId?: string;
};

export type WorkspaceRecord = {
    id: string;
    path: string;
};

export class ChatRepository {
    async createWorkspace(path: string) {
        const name = path.split("/").pop()!;
        const workspace = await WorkspaceModel.create({ path, name });
        return { id: workspace._id.toString(), name, path };
    }

    async createSession(workspaceId: string) {
        const workspace = await WorkspaceModel.findById(workspaceId);
        if (!workspace) return null;

        const session = await SessionModel.create({ workspaceId, conversation: [] });
        return { id: session._id.toString(), workspaceId };
    }

    async appendUserMessage(sessionId: string, message: string) {
        await SessionModel.updateOne(
            { _id: sessionId },
            { $push: { conversation: { role: "user", payload: { message } } } }
        );
    }

    async appendAssistantText(sessionId: string, message: string) {
        await SessionModel.updateOne(
            { _id: sessionId },
            { $push: { conversation: { role: "assistant", payload: { type: "text", message } } } }
        );
    }

    async appendToolCall(sessionId: string, call: ToolCall) {
        await SessionModel.updateOne(
            { _id: sessionId },
            { $push: { conversation: { role: "assistant", payload: { type: "tool-call", ...call } } } }
        );
    }

    async setAnthropicSessionId(sessionId: string, anthropicSessionId: string) {
        await SessionModel.updateOne({ _id: sessionId }, { $set: { anthropicSessionId } });
    }

    async getSessionWithWorkspace(
        sessionId: string
    ): Promise<{ session: SessionRecord; workspace: WorkspaceRecord } | null> {
        const session = await SessionModel.findById(sessionId);
        if (!session) return null;

        const workspace = await WorkspaceModel.findOne({ _id: session.workspaceId });
        if (!workspace) return null;

        return {
            session: {
                id: session._id.toString(),
                anthropicSessionId: session.anthropicSessionId ?? undefined,
            },
            workspace: {
                id: workspace._id.toString(),
                path: workspace.path!,
            },
        };
    }

    async getSnapshot(): Promise<Workspace[]> {
        const [workspaces, sessions] = await Promise.all([WorkspaceModel.find(), SessionModel.find()]);

        return workspaces.map((w) => ({
            id: w._id.toString(),
            name: w.name ?? "",
            path: w.path ?? "",
            sessions: sessions
                .filter((s) => s.workspaceId?.toString() === w._id.toString())
                .map((s) => ({
                    id: s._id.toString(),
                    messages: s.conversation as unknown as Message[],
                })),
        }));
    }

    async getSnapshotSummary(): Promise<WorkspaceSummary[]> {
        const [workspaces, sessions] = await Promise.all([WorkspaceModel.find(), SessionModel.find()]);

        return workspaces.map((w) => ({
            id: w._id.toString(),
            name: w.name ?? "",
            path: w.path ?? "",
            sessions: sessions
                .filter((s) => s.workspaceId?.toString() === w._id.toString())
                .map((s) => ({ id: s._id.toString() })),
        }));
    }

    async getMessages(sessionId: string): Promise<Message[] | null> {
        const session = await SessionModel.findById(sessionId);
        if (!session) return null;
        return session.conversation as unknown as Message[];
    }
}

export const chatRepository = new ChatRepository();
