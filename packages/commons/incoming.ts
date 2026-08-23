import z from "zod";
import { PROVIDER_IDS } from "./providers";

export const CreateWorkspaceSchema = z.object({
    path: z.string(),
});
export type CreateWorkspaceSchemaType = z.infer<typeof CreateWorkspaceSchema>;

export const CreateSessionSchema = z.object({
    provider: z.enum(PROVIDER_IDS),
    model: z.string().optional(),
});
export type CreateSessionSchemaType = z.infer<typeof CreateSessionSchema>;

export const AddMessageSchema = z.object({
    message: z.string(),
});
export type AddMessageSchemaType = z.infer<typeof AddMessageSchema>;

export const PairDeviceSchema = z.object({
    name: z.string().min(1),
});
export type PairDeviceSchemaType = z.infer<typeof PairDeviceSchema>;
