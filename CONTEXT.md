# Crust

A self-hosted chat interface for coding agents: a browser tab talks to a backend that runs an AI agent scoped to a workspace directory on disk, streaming back what it does.

## Language

**Workspace**:
A directory on disk that an agent is allowed to read and edit. The root scope for every session created inside it.
_Avoid_: project, repo (a workspace need not be a git repo).

**Session**:
One conversation thread inside a workspace, bound to exactly one Provider for its entire lifetime. Holds the message transcript and that Provider's own resume identifier.
_Avoid_: conversation, chat, thread.

**Provider**:
One vendor's coding-agent SDK (e.g. Claude, Codex, opencode, Cursor, Gemini) that a Session runs its turns through. Chosen once, at Session creation, and fixed for that Session's lifetime — a resumed conversation has to stay with the vendor that started it, since resume identifiers aren't portable across vendors.
_Avoid_: model, SDK, backend (a Provider may itself offer several models; that selection is a separate concern from which Provider is in use).

**Turn**:
One round trip: a user message sent into a Session, and everything the chosen Provider does in response (tool calls, final text) before going idle again.
_Avoid_: message (a Turn produces one user message but the response side isn't itself "a message" — it's a stream of events).

**Model**:
The specific model id a Session's Provider runs Turns with (e.g. `claude-opus-5` under the Claude Provider). Chosen once, at Session creation, from that Provider's own catalog of offered models; falls back to that Provider's default when not chosen explicitly. Fixed for the Session's lifetime, same as Provider itself.
_Avoid_: version, tier.
