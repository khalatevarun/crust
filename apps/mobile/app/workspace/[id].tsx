import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Link, useFocusEffect, useLocalSearchParams } from "expo-router";
import { DEFAULT_MODEL_ID, isProviderId, PROVIDER_IDS, PROVIDER_MODELS, type ProviderId, type WorkspaceSummary } from "commons";
import { createSession, getSnapshot } from "../../src/api";

export default function WorkspaceScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
    const [provider, setProvider] = useState<ProviderId>("claude");
    const [model, setModel] = useState(DEFAULT_MODEL_ID.claude);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        getSnapshot()
            .then((data) => {
                const found = data.workspaces.find((item) => item.id === id) ?? null;
                setWorkspace(found);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "failed to load"));
    }, [id]);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load]),
    );

    async function addSession() {
        if (!id) return;
        setError(null);
        try {
            await createSession(id, provider, model);
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "failed to create session");
        }
    }

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <Text style={styles.title}>{workspace?.name || workspace?.path || "Workspace"}</Text>
            {error && <Text style={styles.error}>{error}</Text>}
            {workspace?.sessions.map((session) => (
                <Link key={session.id} href={`/session/${session.id}`} asChild>
                    <Pressable style={styles.card}>
                        <Text style={styles.cardTitle}>Session {session.id.slice(-6)}</Text>
                    </Pressable>
                </Link>
            ))}
            <Text style={styles.label}>Provider</Text>
            <View style={styles.pickerWrap}>
                <Picker
                    selectedValue={provider}
                    onValueChange={(value) => {
                        if (!isProviderId(value)) return;
                        setProvider(value);
                        setModel(DEFAULT_MODEL_ID[value]);
                    }}
                    dropdownIconColor="#f5f5f5"
                    style={styles.picker}
                >
                    {PROVIDER_IDS.map((item) => (
                        <Picker.Item key={item} label={item} value={item} color="#f5f5f5" />
                    ))}
                </Picker>
            </View>
            <Text style={styles.label}>Model</Text>
            <View style={styles.pickerWrap}>
                <Picker
                    selectedValue={model}
                    onValueChange={setModel}
                    dropdownIconColor="#f5f5f5"
                    style={styles.picker}
                >
                    {PROVIDER_MODELS[provider].map((option) => (
                        <Picker.Item key={option.id} label={option.label} value={option.id} color="#f5f5f5" />
                    ))}
                </Picker>
            </View>
            <Pressable style={styles.button} onPress={() => void addSession()}>
                <Text style={styles.buttonText}>New session</Text>
            </Pressable>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#111" },
    content: { padding: 16, gap: 12 },
    title: { color: "#f5f5f5", fontSize: 20, fontWeight: "600" },
    error: { color: "#f87171", fontSize: 13 },
    card: { borderColor: "#333", borderWidth: 1, borderRadius: 8, padding: 12 },
    cardTitle: { color: "#f5f5f5", fontSize: 16 },
    label: { color: "#9ca3af", fontSize: 12, textTransform: "uppercase" },
    pickerWrap: { borderColor: "#333", borderWidth: 1, borderRadius: 8, overflow: "hidden" },
    picker: { color: "#f5f5f5" },
    button: { backgroundColor: "#f5f5f5", borderRadius: 8, padding: 12, alignItems: "center" },
    buttonText: { color: "#111", fontWeight: "600" },
});
