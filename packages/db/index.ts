import mongoose, { model, Schema } from "mongoose";

export const Workspace = new mongoose.Schema({
    path: String,
    name: String,
})

export const Session = new mongoose.Schema({
    conversaton: [Object],
    workspaceId: [{ type: Schema.Types.ObjectId, ref: 'Workspace'}]
})

export const WorkspaceModel = model("Workspace", Workspace);
export const SessionModel = model("Session", Session);