import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import type { WorkspaceSummary } from "commons";
import { createWorkspace, deleteWorkspace, getSnapshot } from "../src/api";

export default function WorkspacesScreen() {
    const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
    const [path, setPath] = useState("");
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        getSnapshot()
            .then((data) => setWorkspaces(data.workspaces))
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "failed to load"));
    }, []);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load]),
    );

    async function remove(id: string) {
        setError(null);
        try {
            await deleteWorkspace(id);
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "failed to delete workspace");
            load();
        }
    }
    async function add() {
        const next = path.trim();
        if (!next) return;
        setError(null);
        try {
            await createWorkspace(next);
            setPath("");
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "failed to create workspace");
        }
    }

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Workspaces</Text>
            {error && <Text style={styles.error}>{error}</Text>}
            {workspaces.map((workspace) => (
                <View key={workspace.id} style={styles.card}>
                    <Link href={`/workspace/${workspace.id}`} asChild>
                        <Pressable>
                            <Text style={styles.cardTitle}>{workspace.name || workspace.path}</Text>
                            <Text style={styles.muted}>{workspace.path}</Text>
                            <Text style={styles.muted}>{workspace.sessions.length} sessions</Text>
                        </Pressable>
                    </Link>
                    <Pressable onPress={() => void remove(workspace.id)}>
                        <Text style={styles.delete}>Delete</Text>
                    </Pressable>
                </View>
            ))}
            <TextInput
                style={styles.input}
                placeholder="/path/to/workspace"
                placeholderTextColor="#6b7280"
                value={path}
                onChangeText={setPath}
                autoCapitalize="none"
            />
            <Pressable style={styles.button} onPress={() => void add()}>
                <Text style={styles.buttonText}>New workspace</Text>
            </Pressable>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#111" },
    content: { padding: 16, gap: 12 },
    title: { color: "#f5f5f5", fontSize: 20, fontWeight: "600" },
    error: { color: "#f87171", fontSize: 13 },
    card: { borderColor: "#333", borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 },
    cardTitle: { color: "#f5f5f5", fontSize: 16 },
    muted: { color: "#9ca3af", fontSize: 12 },
    delete: { color: "#f87171", fontSize: 13 },
    input: { borderColor: "#333", borderWidth: 1, borderRadius: 8, color: "#f5f5f5", padding: 10 },
    button: { backgroundColor: "#f5f5f5", borderRadius: 8, padding: 12, alignItems: "center" },
    buttonText: { color: "#111", fontWeight: "600" },
});
