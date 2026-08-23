import z from "zod";

export const CreateWorkspaceSchema = z.object({
    path: z.string(),
});
export type CreateWorkspaceSchemaType = z.infer<typeof CreateWorkspaceSchema>;

export const CreateSessionSchema = z.object({});
export type CreateSessionSchemaType = z.infer<typeof CreateSessionSchema>;

export const AddMessageSchema = z.object({
    message: z.string(),
});
export type AddMessageSchemaType = z.infer<typeof AddMessageSchema>;
