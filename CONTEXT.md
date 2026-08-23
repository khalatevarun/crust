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
