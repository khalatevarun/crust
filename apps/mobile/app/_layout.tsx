import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
    return (
        <>
            <StatusBar style="light" />
            <Stack
                screenOptions={{
                    headerStyle: { backgroundColor: "#111" },
                    headerTintColor: "#f5f5f5",
                    contentStyle: { backgroundColor: "#111" },
                }}
            >
                <Stack.Screen name="index" options={{ title: "Scan to pair" }} />
                <Stack.Screen name="workspaces" options={{ title: "Workspaces" }} />
                <Stack.Screen name="workspace/[id]" options={{ title: "Sessions" }} />
                <Stack.Screen name="session/[id]" options={{ title: "Session" }} />
            </Stack>
        </>
    );
}
