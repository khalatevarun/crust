import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "crust.deviceToken";
const BACKEND_URL_KEY = "crust.backendUrl";

export async function getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getBackendUrl(): Promise<string | null> {
    return AsyncStorage.getItem(BACKEND_URL_KEY);
}

export async function savePairing(token: string, backendUrl: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await AsyncStorage.setItem(BACKEND_URL_KEY, backendUrl);
}

export async function clearPairing(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await AsyncStorage.removeItem(BACKEND_URL_KEY);
}
