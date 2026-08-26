# Reach crust from a phone away from home

Use this when the backend already runs on your laptop and you have paired a phone on Wi-Fi. The phone needs the same Tailscale network as the laptop. This guide does not publish Expo Metro. A cold start of Expo Go off Wi-Fi still cannot load JS from `8081`. See [Expo Go still cannot load Metro off home Wi-Fi](https://github.com/khalatevarun/crust/issues/17).

Why crust reads Serve instead of starting it is in [ADR 0004](adr/0004-detect-tailscale-serve-do-not-start-it.md). Why every request uses a Device Token is in [ADR 0003](adr/0003-tailscale-and-uniform-device-tokens.md).

## Publish the backend on your tailnet

1. Install Tailscale on the Mac and sign in. The CLI is `tailscale` on PATH, or `/Applications/Tailscale.app/Contents/MacOS/Tailscale`.
2. Install Tailscale on the phone, sign in to the same tailnet, and leave the VPN on when you leave the house.
3. If `tailscale serve` asks you to enable HTTPS certificates, do that in the tailnet admin console.
4. Start the crust backend so it accepts HTTP on `127.0.0.1:3001`.
5. Run `tailscale serve --bg 3001`. Use `--bg`. A foreground Serve stops when that terminal closes.
6. Run `tailscale serve status`. You must see an `https://` host and `proxy http://127.0.0.1:3001`.
7. On the phone, with Tailscale connected, open `https://<host>/api/snapshot` in Safari. A 401 without a token still means the host is reachable. A timeout does not.

If pairing later still shows a LAN IP, set `CRUST_BACKEND_URL` to the `https://` host on the backend process, not the frontend. Then pair again.

## Pair the phone with that URL

1. Open the desktop app and go to Devices.
2. Pair a new device.
3. Confirm the URL under the QR is `https://`, not a `192.168.*` address. If it is a LAN URL, the screen tells you to serve and pair again.
4. Scan the QR in Expo Go. The phone stores that URL for every later request.
5. Leave the house. Keep the laptop awake, the backend running, and Serve configured.

If this phone already stored a LAN URL, revoke that device on the Devices screen, then pair again after Serve is up. The phone does not pick up a new URL on its own.

Revoke a row on that screen if you lose the device. Tokens do not expire.
