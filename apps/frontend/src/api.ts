import type { Message, ProviderId, WorkspaceSummary } from "commons";

export const API_BASE = "http://localhost:3001";
export const BACKEND_PUBLIC_URL =
    (typeof process !== "undefined" && process.env.CRUST_BACKEND_URL) || API_BASE;

const TOKEN_KEY = "crust.deviceToken";

export type DeviceInfo = {
    id: string;
    name: string;
    createdAt: string;
    lastUsedAt?: string;
};

export function getStoredToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

function storeToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

async function parseJson<T>(res: Response): Promise<T> {
    if (!res.ok) {
        let message = res.statusText;
        try {
            const body = await res.json() as { error?: string };
            if (body.error) message = body.error;
        } catch {
            message = res.statusText;
        }
        throw new Error(message);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
}

async function pairDesktopBrowser(): Promise<void> {
    const res = await fetch(`${API_BASE}/api/devices/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Desktop browser" }),
    });
    if (res.status === 401) {
        throw new Error(
            "This browser isn't paired, and another device already owns the backend. Pair from a connected device, or reset the devices collection if you're starting over locally.",
        );
    }
    const data = await parseJson<{ token: string }>(res);
    storeToken(data.token);
}

export async function ensureDesktopToken(): Promise<void> {
    if (getStoredToken()) {
        const res = await fetch(`${API_BASE}/api/devices`, { headers: authHeaders() });
        if (res.ok) return;
        if (res.status !== 401) {
            await parseJson(res);
        }
        clearToken();
    }
    await pairDesktopBrowser();
}

export function getSnapshot(): Promise<{ workspaces: WorkspaceSummary[] }> {
    return fetch(`${API_BASE}/api/snapshot`, { headers: authHeaders() }).then((res) => parseJson(res));
}

export function createWorkspace(path: string): Promise<{ id: string; name: string; path: string }> {
    return fetch(`${API_BASE}/api/workspaces`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ path }),
    }).then((res) => parseJson(res));
}

export function deleteWorkspace(workspaceId: string): Promise<void> {
    return fetch(`${API_BASE}/api/workspaces/${workspaceId}`, {
        method: "DELETE",
        headers: authHeaders(),
    }).then((res) => parseJson(res));
}

export function createSession(
    workspaceId: string,
    provider: ProviderId,
    model: string,
): Promise<{ id: string; workspaceId: string; provider: ProviderId; model: string }> {
    return fetch(`${API_BASE}/api/workspaces/${workspaceId}/sessions`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ provider, model }),
    }).then((res) => parseJson(res));
}

export function getMessages(sessionId: string): Promise<{ messages: Message[] }> {
    return fetch(`${API_BASE}/api/sessions/${sessionId}/messages`, {
        headers: authHeaders(),
    }).then((res) => parseJson(res));
}

export function addMessage(sessionId: string, message: string): Promise<{ sessionId: string }> {
    return fetch(`${API_BASE}/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ message }),
    }).then((res) => parseJson(res));
}

export function sessionEventsUrl(sessionId: string): string {
    const token = getStoredToken();
    const url = `${API_BASE}/api/sessions/${sessionId}/events`;
    if (!token) return url;
    return `${url}?token=${encodeURIComponent(token)}`;
}

export function listDevices(): Promise<{ devices: DeviceInfo[] }> {
    return fetch(`${API_BASE}/api/devices`, { headers: authHeaders() }).then((res) => parseJson(res));
}

export function pairDevice(name: string): Promise<DeviceInfo & { token: string; backendUrl: string }> {
    return fetch(`${API_BASE}/api/devices/pair`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name }),
    }).then((res) => parseJson(res));
}

export function deleteDevice(id: string): Promise<void> {
    return fetch(`${API_BASE}/api/devices/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
    }).then((res) => parseJson(res));
}
