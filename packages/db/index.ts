import mongoose, { model, Schema } from "mongoose";

export const Workspace = new mongoose.Schema({
    path: String,
    name: String,
})

export const Session = new mongoose.Schema({
    role: {
        type: String,
        enum: ['user', 'assistant'],
    },
    conversation: [Object],
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace' },
    provider: {
        type: String,
        enum: ["claude", "codex", "opencode", "cursor", "gemini"],
        required: true,
        default: "claude",
    },
    providerSessionId: String,
})

export const WorkspaceModel = model("Workspace", Workspace);
export const SessionModel = model("Session", Session);