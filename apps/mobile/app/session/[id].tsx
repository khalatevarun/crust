import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import EventSource from "react-native-sse";
import type { Message } from "commons";
import { addMessage, getMessages, sessionEventsTarget } from "../../src/api";

export default function SessionScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        let source: EventSource<"tool-call" | "assistant-message"> | null = null;
        let applyLive = false;

        async function connect() {
            try {
                const data = await getMessages(id);
                if (cancelled) return;
                setMessages(data.messages);
                const target = await sessionEventsTarget(id);
                source = new EventSource<"tool-call" | "assistant-message">(target.url, {
                    headers: { Authorization: `Bearer ${target.token}` },
                });
                source.addEventListener("open", () => {
                    applyLive = false;
                    void getMessages(id).then((fresh) => {
                        if (cancelled) return;
                        setMessages(fresh.messages);
                        applyLive = true;
                    });
                });
                source.addEventListener("tool-call", (event) => {
                    if (!applyLive || cancelled || typeof event.data !== "string") return;
                    const payload = JSON.parse(event.data) as { id?: string; name: string; input?: unknown };
                    setMessages((prev) => [
                        ...prev,
                        { role: "assistant", payload: { type: "tool-call", id: payload.id, name: payload.name, input: payload.input } },
                    ]);
                });
                source.addEventListener("assistant-message", (event) => {
                    if (!applyLive || cancelled || typeof event.data !== "string") return;
                    const payload = JSON.parse(event.data) as { message: string };
                    setMessages((prev) => [
                        ...prev,
                        { role: "assistant", payload: { type: "text", message: payload.message } },
                    ]);
                });
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : "failed to open session");
            }
        }

        void connect();
        return () => {
            cancelled = true;
            source?.close();
        };
    }, [id]);

    async function send() {
        const text = input.trim();
        if (!text || !id) return;
        setMessages((prev) => [...prev, { role: "user", payload: { message: text } }]);
        setInput("");
        try {
            await addMessage(id, text);
        } catch (err) {
            setError(err instanceof Error ? err.message : "failed to send");
        }
    }

    return (
        <View style={styles.screen}>
            <ScrollView contentContainerStyle={styles.transcript}>
                {error && <Text style={styles.error}>{error}</Text>}
                {messages.length === 0 && <Text style={styles.muted}>No messages yet.</Text>}
                {messages.map((message, index) => (
                    <MessageBubble key={index} message={message} />
                ))}
            </ScrollView>
            <View style={styles.composer}>
                <TextInput
                    style={styles.input}
                    placeholder="Type a message..."
                    placeholderTextColor="#6b7280"
                    value={input}
                    onChangeText={setInput}
                />
                <Pressable style={styles.button} onPress={() => void send()}>
                    <Text style={styles.buttonText}>Send</Text>
                </Pressable>
            </View>
        </View>
    );
}

function MessageBubble({ message }: { message: Message }) {
    if (message.role === "assistant" && message.payload.type === "tool-call") {
        return (
            <View style={styles.tool}>
                <Text style={styles.muted}>tool {message.payload.name}</Text>
            </View>
        );
    }
    const text = message.role === "user"
        ? message.payload.message
        : message.payload.type === "text"
            ? message.payload.message
            : "";
    const isUser = message.role === "user";
    return (
        <View style={[styles.bubble, isUser ? styles.user : styles.assistant]}>
            <Text style={isUser ? styles.userText : styles.assistantText}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#111" },
    transcript: { padding: 16, gap: 8 },
    error: { color: "#f87171", fontSize: 13 },
    muted: { color: "#9ca3af", fontSize: 13 },
    composer: { flexDirection: "row", gap: 8, padding: 12, borderTopColor: "#333", borderTopWidth: 1 },
    input: { flex: 1, borderColor: "#333", borderWidth: 1, borderRadius: 8, color: "#f5f5f5", padding: 10 },
    button: { backgroundColor: "#f5f5f5", borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" },
    buttonText: { color: "#111", fontWeight: "600" },
    bubble: { maxWidth: "85%", borderRadius: 10, padding: 10 },
    user: { alignSelf: "flex-end", backgroundColor: "#f5f5f5" },
    assistant: { alignSelf: "flex-start", backgroundColor: "#222" },
    userText: { color: "#111" },
    assistantText: { color: "#f5f5f5" },
    tool: { alignSelf: "flex-start", borderColor: "#333", borderWidth: 1, borderRadius: 8, padding: 8 },
});
