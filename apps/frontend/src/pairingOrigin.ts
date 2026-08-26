import type { OriginKind } from "./api";

export function pairingOriginHint(kind: OriginKind): string {
    switch (kind) {
        case "tailscale-serve":
        case "env":
            return "This URL is for any device on your Tailscale network.";
        case "lan":
        case "loopback":
            return "This URL only works on this Wi-Fi. To use the phone away from home, run tailscale serve --bg 3001, then pair again. If this phone already paired with a LAN URL, revoke that device and pair again after Serve is up.";
        default: {
            const _exhaustive: never = kind;
            return _exhaustive;
        }
    }
}
