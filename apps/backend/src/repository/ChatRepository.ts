import { WorkspaceModel, SessionModel } from "db";
import { DEFAULT_MODEL_ID, isProviderId, type Message, type ProviderId, type Workspace, type WorkspaceSummary } from "commons";

export type ToolCall = {
    id?: string;
    name: string;
    input?: unknown;
};

export type SessionRecord = {
    id: string;
    provider: ProviderId;
    model: string;
    providerSessionId?: string;
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

    async createSession(workspaceId: string, provider: ProviderId, model: string) {
        const workspace = await WorkspaceModel.findById(workspaceId);
        if (!workspace) return null;

        const session = await SessionModel.create({ workspaceId, provider, model, conversation: [] });
        return { id: session._id.toString(), workspaceId, provider, model };
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

    async setProviderSessionId(sessionId: string, providerSessionId: string) {
        await SessionModel.updateOne({ _id: sessionId }, { $set: { providerSessionId } });
    }

    async getSessionWithWorkspace(
        sessionId: string
    ): Promise<{ session: SessionRecord; workspace: WorkspaceRecord } | null> {
        const session = await SessionModel.findById(sessionId);
        if (!session) return null;

        const workspace = await WorkspaceModel.findOne({ _id: session.workspaceId });
        if (!workspace) return null;

        const provider = isProviderId(session.provider) ? session.provider : "claude";
        return {
            session: {
                id: session._id.toString(),
                provider,
                model: typeof session.model === "string" && session.model.length > 0
                    ? session.model
                    : DEFAULT_MODEL_ID[provider],
                providerSessionId: session.providerSessionId ?? undefined,
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
