import type { Message, WorkspaceSummary } from "commons";

export const API_BASE = "http://localhost:3001";

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
    return res.json() as Promise<T>;
}

export function getSnapshot(): Promise<{ workspaces: WorkspaceSummary[] }> {
    return fetch(`${API_BASE}/api/snapshot`).then((res) => parseJson(res));
}

export function createWorkspace(path: string): Promise<{ id: string; name: string; path: string }> {
    return fetch(`${API_BASE}/api/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
    }).then((res) => parseJson(res));
}

export function createSession(workspaceId: string): Promise<{ id: string; workspaceId: string }> {
    return fetch(`${API_BASE}/api/workspaces/${workspaceId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    }).then((res) => parseJson(res));
}

export function getMessages(sessionId: string): Promise<{ messages: Message[] }> {
    return fetch(`${API_BASE}/api/sessions/${sessionId}/messages`).then((res) => parseJson(res));
}

export function addMessage(sessionId: string, message: string): Promise<{ sessionId: string }> {
    return fetch(`${API_BASE}/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
    }).then((res) => parseJson(res));
}

export function sessionEventsUrl(sessionId: string): string {
    return `${API_BASE}/api/sessions/${sessionId}/events`;
}
