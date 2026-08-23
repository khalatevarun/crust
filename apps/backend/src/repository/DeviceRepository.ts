import { DeviceModel } from "db";

export type DeviceRecord = {
    id: string;
    name: string;
    createdAt: Date;
    lastUsedAt?: Date;
};

export type DeviceAuthRecord = DeviceRecord & {
    tokenHash: string;
};

export class DeviceRepository {
    async count(): Promise<number> {
        return DeviceModel.countDocuments();
    }

    async create(name: string, tokenHash: string): Promise<DeviceRecord> {
        const device = await DeviceModel.create({ name, tokenHash });
        return toRecord(device);
    }

    async findByTokenHash(tokenHash: string): Promise<DeviceAuthRecord | null> {
        const device = await DeviceModel.findOne({ tokenHash });
        if (!device) return null;
        return {
            ...toRecord(device),
            tokenHash: device.tokenHash,
        };
    }

    async list(): Promise<DeviceRecord[]> {
        const devices = await DeviceModel.find().sort({ createdAt: 1 });
        return devices.map(toRecord);
    }

    async delete(id: string): Promise<boolean> {
        const result = await DeviceModel.deleteOne({ _id: id });
        return result.deletedCount === 1;
    }

    touchLastUsed(id: string): void {
        void DeviceModel.updateOne({ _id: id }, { $set: { lastUsedAt: new Date() } });
    }
}

function toRecord(device: {
    _id: { toString(): string };
    name: string;
    createdAt?: Date;
    lastUsedAt?: Date | null;
}): DeviceRecord {
    return {
        id: device._id.toString(),
        name: device.name,
        createdAt: device.createdAt ?? new Date(0),
        lastUsedAt: device.lastUsedAt ?? undefined,
    };
}

export const deviceRepository = new DeviceRepository();
