# Detect Tailscale Serve for pairing, and do not start it

Pairing has to put a URL in the QR that a phone can reuse off home Wi-Fi. crust reads `tailscale serve status --json` and prefers that origin when the proxy targets the backend port. It never runs `tailscale serve` or `tailscale serve off`. The operator runs `tailscale serve --bg 3001` because a foreground Serve dies with the terminal. Funnel stays rejected; see [ADR 0003](0003-tailscale-and-uniform-device-tokens.md).
