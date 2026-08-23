# Hardcode the per-provider model catalog, resolve the default at session creation

Each Provider's list of available models is a static, hand-maintained constant in code (`PROVIDER_MODELS` in `commons`) rather than fetched live from that vendor's API. This goes stale when a vendor ships a new model until someone updates the list by hand — accepted, since not every agent SDK cleanly exposes a "list models" call, and a live dependency at session-creation time is a worse tradeoff than an occasionally-stale list.

When a session is created without an explicit model, the provider's default model id is resolved immediately and persisted on the Session document — not re-resolved on every turn. If `DEFAULT_MODEL_ID` for a provider changes later, existing sessions keep whichever model they were actually created with; only new sessions pick up the new default. The alternative — storing "no model chosen, resolve the default each time" — would mean a session's effective model could silently change out from under an existing conversation.

Considered fetching models dynamically per provider — rejected for the reasons above; revisit if a provider's model catalog turns out to change often enough that hand-maintenance becomes a real burden.
