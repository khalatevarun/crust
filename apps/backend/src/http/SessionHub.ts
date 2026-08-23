import type { SessionEvent } from "commons";

export type Subscriber = (event: SessionEvent) => void;

export class SessionHub {
    private readonly subscribers = new Map<string, Set<Subscriber>>();

    subscribe(sessionId: string, subscriber: Subscriber): () => void {
        let set = this.subscribers.get(sessionId);
        if (!set) {
            set = new Set();
            this.subscribers.set(sessionId, set);
        }
        set.add(subscriber);
        return () => {
            set.delete(subscriber);
            if (set.size === 0) {
                this.subscribers.delete(sessionId);
            }
        };
    }

    publish(sessionId: string, event: SessionEvent): void {
        const set = this.subscribers.get(sessionId);
        if (!set) return;
        for (const subscriber of set) {
            subscriber(event);
        }
    }
}

export const sessionHub = new SessionHub();
