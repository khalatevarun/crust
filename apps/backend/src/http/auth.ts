import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "./HttpError";
import type { DeviceRecord, DeviceRepository } from "../repository/DeviceRepository";

export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
    return randomBytes(32).toString("base64url");
}

export function readBearerToken(req: Request): string | null {
    const header = req.headers.get("Authorization");
    if (header?.startsWith("Bearer ")) {
        const token = header.slice("Bearer ".length).trim();
        if (token.length > 0) return token;
    }
    return null;
}

export function readAccessToken(req: Request, allowQuery: boolean): string | null {
    const bearer = readBearerToken(req);
    if (bearer) return bearer;
    if (!allowQuery) return null;
    const token = new URL(req.url).searchParams.get("token");
    if (token && token.length > 0) return token;
    return null;
}

export async function authenticateRequest(
    req: Request,
    devices: DeviceRepository,
    allowQueryToken: boolean,
): Promise<DeviceRecord> {
    const token = readAccessToken(req, allowQueryToken);
    if (!token) {
        throw new HttpError(401, "unauthorized");
    }

    const device = await devices.findByTokenHash(hashToken(token));
    if (!device) {
        throw new HttpError(401, "unauthorized");
    }

    devices.touchLastUsed(device.id);
    return device;
}
