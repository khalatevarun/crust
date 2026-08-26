import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { confirmPairing } from "../src/api";
import { parsePairPayload } from "../src/pairing";
import { getBackendUrl, getToken, savePairing } from "../src/storage";

export default function PairScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        let cancelled = false;
        Promise.all([getToken(), getBackendUrl()]).then(([token, backendUrl]) => {
            if (cancelled) return;
            if (token && backendUrl) {
                router.replace("/workspaces");
                return;
            }
            setChecking(false);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    async function onScan(raw: string) {
        if (busy) return;
        const payload = parsePairPayload(raw);
        if (!payload) {
            setError("QR is not a crust pairing code");
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await confirmPairing(payload.backendUrl, payload.token);
            await savePairing(payload.token, payload.backendUrl);
            router.replace("/workspaces");
        } catch (err) {
            const message = err instanceof Error ? err.message : "pairing failed";
            const unreachable = message === "Network request failed"
                || message === "Failed to fetch"
                || err instanceof TypeError;
            setError(
                unreachable
                    ? `Cannot reach ${payload.backendUrl}. Phone and Mac must be on the same network, and the QR host cannot be localhost.`
                    : message,
            );
            setBusy(false);
        }
    }

    if (checking) {
        return (
            <View style={styles.center}>
                <Text style={styles.muted}>Checking pairing...</Text>
            </View>
        );
    }

    if (!permission) {
        return <View style={styles.center} />;
    }

    if (!permission.granted) {
        return (
            <View style={styles.center}>
                <Text style={styles.title}>Scan to pair</Text>
                <Text style={styles.muted}>Camera access is needed to read the desktop QR.</Text>
                <Pressable style={styles.button} onPress={() => void requestPermission()}>
                    <Text style={styles.buttonText}>Allow camera</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.screen}>
            <Text style={styles.title}>Scan to pair</Text>
            <Text style={styles.muted}>Point the camera at the QR on the desktop Devices screen.</Text>
            <CameraView
                style={styles.camera}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={(event) => {
                    void onScan(event.data);
                }}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            {busy && <Text style={styles.muted}>Confirming token...</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#111", padding: 16, gap: 12 },
    center: { flex: 1, backgroundColor: "#111", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
    title: { color: "#f5f5f5", fontSize: 20, fontWeight: "600" },
    muted: { color: "#9ca3af", fontSize: 14 },
    error: { color: "#f87171", fontSize: 13 },
    camera: { flex: 1, borderRadius: 8, overflow: "hidden" },
    button: { backgroundColor: "#f5f5f5", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
    buttonText: { color: "#111", fontWeight: "600" },
});
