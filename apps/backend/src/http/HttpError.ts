export class HttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "HttpError";
        this.status = status;
    }
}

export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

export function json(data: unknown, status = 200): Response {
    return Response.json(data, { status, headers: corsHeaders });
}

export function errorResponse(err: unknown): Response {
    if (err instanceof HttpError) {
        return json({ error: err.message }, err.status);
    }
    console.error(err);
    return json({ error: "internal error" }, 500);
}

export function zodErrorMessage(error: { message: string }): string {
    return error.message;
}

export function isObjectId(id: string): boolean {
    return /^[a-fA-F0-9]{24}$/.test(id);
}
