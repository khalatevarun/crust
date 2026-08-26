import { expect, test } from "bun:test";
import { pairingOriginHint } from "./pairingOrigin";

test("Serve and env origins say the phone can leave this Wi-Fi", () => {
    expect(pairingOriginHint("tailscale-serve")).toBe(
        "This URL is for any device on your Tailscale network.",
    );
    expect(pairingOriginHint("env")).toBe(
        "This URL is for any device on your Tailscale network.",
    );
});

test("LAN and loopback origins tell you to serve and pair again", () => {
    const hint = pairingOriginHint("lan");
    expect(hint).toContain("only works on this Wi-Fi");
    expect(hint).toContain("tailscale serve --bg 3001");
    expect(hint).toContain("revoke that device");
    expect(pairingOriginHint("loopback")).toBe(hint);
});
