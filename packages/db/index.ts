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
    model: { type: String, required: true },
})

export const Device = new mongoose.Schema({
    name: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date },
});

export const WorkspaceModel = model("Workspace", Workspace);
export const SessionModel = model("Session", Session);
export const DeviceModel = model("Device", Device);