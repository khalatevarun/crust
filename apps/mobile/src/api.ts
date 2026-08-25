import type { Message, ProviderId, WorkspaceSummary } from "commons";
import { getBackendUrl, getToken } from "./storage";

async function authContext(): Promise<{ backendUrl: string; token: string }> {
    const [backendUrl, token] = await Promise.all([getBackendUrl(), getToken()]);
    if (!backendUrl || !token) {
        throw new Error("not paired");
    }
    return { backendUrl, token };
}

function headers(token: string): HeadersInit {
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
    };
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

export async function confirmPairing(backendUrl: string, token: string): Promise<void> {
    const res = await fetch(`${backendUrl}/api/devices`, {
        headers: headers(token),
    });
    await parseJson(res);
}

export async function getSnapshot(): Promise<{ workspaces: WorkspaceSummary[] }> {
    const { backendUrl, token } = await authContext();
    const res = await fetch(`${backendUrl}/api/snapshot`, { headers: headers(token) });
    return parseJson(res);
}

export async function createWorkspace(path: string): Promise<{ id: string; name: string; path: string }> {
    const { backendUrl, token } = await authContext();
    const res = await fetch(`${backendUrl}/api/workspaces`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ path }),
    });
    return parseJson(res);
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
    const { backendUrl, token } = await authContext();
    const res = await fetch(`${backendUrl}/api/workspaces/${workspaceId}`, {
        method: "DELETE",
        headers: headers(token),
    });
    await parseJson(res);
}

export async function createSession(
    workspaceId: string,
    provider: ProviderId,
    model: string,
): Promise<{ id: string; workspaceId: string; provider: ProviderId; model: string }> {
    const { backendUrl, token } = await authContext();
    const res = await fetch(`${backendUrl}/api/workspaces/${workspaceId}/sessions`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ provider, model }),
    });
    return parseJson(res);
}

export async function getMessages(sessionId: string): Promise<{ messages: Message[] }> {
    const { backendUrl, token } = await authContext();
    const res = await fetch(`${backendUrl}/api/sessions/${sessionId}/messages`, {
        headers: headers(token),
    });
    return parseJson(res);
}

export async function addMessage(sessionId: string, message: string): Promise<{ sessionId: string }> {
    const { backendUrl, token } = await authContext();
    const res = await fetch(`${backendUrl}/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ message }),
    });
    return parseJson(res);
}

export async function sessionEventsTarget(sessionId: string): Promise<{ url: string; token: string }> {
    const { backendUrl, token } = await authContext();
    return { url: `${backendUrl}/api/sessions/${sessionId}/events`, token };
}
