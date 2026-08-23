import { PairDeviceSchema } from "commons";
import { generateToken, hashToken, authenticateRequest, readBearerToken } from "../http/auth";
import { HttpError, zodErrorMessage } from "../http/HttpError";
import type { DeviceRecord, DeviceRepository } from "../repository/DeviceRepository";

export async function handlePairDevice(
    req: Request,
    payload: unknown,
    devices: DeviceRepository,
): Promise<DeviceRecord & { token: string }> {
    const parsed = PairDeviceSchema.safeParse(payload);
    if (!parsed.success) {
        throw new HttpError(400, zodErrorMessage(parsed.error));
    }

    const count = await devices.count();
    if (count > 0) {
        if (!readBearerToken(req)) {
            throw new HttpError(401, "unauthorized");
        }
        await authenticateRequest(req, devices, false);
    }

    const token = generateToken();
    const device = await devices.create(parsed.data.name, hashToken(token));
    return { ...device, token };
}

export async function handleListDevices(devices: DeviceRepository): Promise<{ devices: DeviceRecord[] }> {
    return { devices: await devices.list() };
}

export async function handleDeleteDevice(id: string, devices: DeviceRepository): Promise<void> {
    const deleted = await devices.delete(id);
    if (!deleted) {
        throw new HttpError(404, "device not found");
    }
}
