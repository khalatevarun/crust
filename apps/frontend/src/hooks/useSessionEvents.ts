import { useEffect, useState } from "react";
import type { Message } from "commons";
import { getMessages, sessionEventsUrl } from "../api";

export function useSessionEvents(sessionId: string | null) {
    const [messages, setMessages] = useState<Message[]>([]);

    useEffect(() => {
        if (!sessionId) {
            setMessages([]);
            return;
        }

        const id = sessionId;
        let cancelled = false;
        let applyLive = false;
        const source = new EventSource(sessionEventsUrl(id));

        async function loadTranscript() {
            applyLive = false;
            try {
                const data = await getMessages(id);
                if (cancelled) return;
                setMessages(data.messages);
                applyLive = true;
            } catch (err) {
                console.error("failed to load transcript", err);
            }
        }

        source.onopen = () => {
            void loadTranscript();
        };

        source.addEventListener("tool-call", (event) => {
            if (!applyLive || cancelled) return;
            const payload = JSON.parse((event as MessageEvent).data) as {
                id?: string;
                name: string;
                input?: unknown;
            };
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    payload: { type: "tool-call", id: payload.id, name: payload.name, input: payload.input },
                },
            ]);
        });

        source.addEventListener("assistant-message", (event) => {
            if (!applyLive || cancelled) return;
            const payload = JSON.parse((event as MessageEvent).data) as { message: string };
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    payload: { type: "text", message: payload.message },
                },
            ]);
        });

        return () => {
            cancelled = true;
            source.close();
        };
    }, [sessionId]);

    return { messages, setMessages };
}
