# Reach crust from another device

The backend listens on `http://localhost:3001`. Tailscale Serve publishes that port on your tailnet as HTTPS so a phone can call the same API the desktop browser uses.

## Publish the backend

1. Install Tailscale on the machine that runs the backend and sign in.
2. Start crust's backend as usual.
3. Run `tailscale serve 3001`.
4. Copy the `https://<tailnet-name>.ts.net` URL Tailscale prints.

Set `CRUST_BACKEND_URL` to that URL when you build or start the desktop frontend. The Devices screen embeds it in the pairing QR so the phone does not have to type it.

## Pair a device

Open the desktop app and go to Devices. The first visit bootstraps a desktop token with no existing devices. After that, Pair new device mints a token for the phone and shows a QR of `{ token, backendUrl }`.

Revoke a row on that screen if you lose the device. Tokens do not expire.
