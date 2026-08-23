import z from "zod";
import { PROVIDER_IDS } from "./providers";

export const WorkspaceCreatedSchema = z.object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
});
export type WorkspaceCreatedSchemaType = z.infer<typeof WorkspaceCreatedSchema>;

export const SessionsCreatedSchema = z.object({
    id: z.string(),
    workspaceId: z.string(),
    provider: z.enum(PROVIDER_IDS),
    model: z.string(),
});
export type SessionCreatedSchemaType = z.infer<typeof SessionsCreatedSchema>;

export const MessageAdded = z.object({
    sessionId: z.string(),
});
export type MessageAddedType = z.infer<typeof MessageAdded>;

export const AssistantMessageAdded = z.object({
    sessionId: z.string(),
    type: z.literal("text").optional(),
    message: z.string(),
});
export type AssistantMessageAddedType = z.infer<typeof AssistantMessageAdded>;

export const ToolCallMessageAdded = z.object({
    sessionId: z.string(),
    id: z.string().optional(),
    name: z.string(),
    input: z.unknown().optional(),
});
export type ToolCallMessageAddedType = z.infer<typeof ToolCallMessageAdded>;

export type SessionEvent =
    | { type: "tool-call"; payload: ToolCallMessageAddedType }
    | { type: "assistant-message"; payload: AssistantMessageAddedType };

export type WorkspaceSummary = {
    id: string;
    name: string;
    path: string;
    sessions: { id: string }[];
};

export type Workspace = {
    id: string;
    name: string;
    path: string;
    sessions: Session[];
};

export type Session = {
    id: string;
    messages: Message[];
};

/** Provider-neutral conversation entry. Tool calls stay on assistant + typed payload. */
export type Message =
    | {
        role: "user";
        payload: {
            message: string;
        };
    }
    | {
        role: "assistant";
        payload: {
            type: "text";
            message: string;
        };
    }
    | {
        role: "assistant";
        payload: {
            type: "tool-call";
            id?: string;
            name: string;
            input?: unknown;
        };
    };
