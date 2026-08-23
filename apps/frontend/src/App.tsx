import "./index.css";
import { useContext, useEffect, useState } from "react";
import type { Message, ProviderId, WorkspaceSummary } from "commons";
import { isProviderId, PROVIDER_IDS } from "commons";
import { AppContext } from "./context/AppContext";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { addMessage, createSession, createWorkspace, getSnapshot } from "./api";
import { useSessionEvents } from "./hooks/useSessionEvents";

export function App() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSnapshot()
      .then((data) => {
        if (cancelled) return;
        setWorkspaces(data.workspaces);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "failed to load");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground text-sm">
        Connecting...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground text-sm">
        {loadError}
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ workspaces, setWorkspaces, activeSessionId, setActiveSessionId }}>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar />
        <ChatWindow />
      </div>
    </AppContext.Provider>
  );
}

function ChatWindow() {
  const { activeSessionId } = useContext(AppContext);
  const { messages, setMessages } = useSessionEvents(activeSessionId);
  const [input, setInput] = useState("");

  function sendMessage() {
    const text = input.trim();
    if (!text || !activeSessionId) return;

    setMessages((prev) => [...prev, { role: "user", payload: { message: text } }]);
    void addMessage(activeSessionId, text).catch((err) => {
      console.error("failed to send message", err);
    });
    setInput("");
  }

  if (!activeSessionId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        Select or create a session to start chatting
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-w-0">
      <div className="border-b border-border px-4 py-3 text-sm font-medium">
        Session {activeSessionId.slice(-6)}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No messages yet. Say hello.
          </div>
        )}
        {messages.map((m, i) => (
          <ChatBubble key={i} message={m} />
        ))}
      </div>

      <div className="flex gap-2 border-t border-border p-3">
        <input
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: Message }) {
  if (message.role === "assistant" && message.payload.type === "tool-call") {
    const { name, input } = message.payload;
    const inputPreview = input !== undefined
      ? JSON.stringify(input, null, 2)
      : null;

    return (
      <div className="flex justify-start">
        <details className="group w-full max-w-[85%] rounded-md border border-border/70 bg-transparent">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="select-none text-muted-foreground/50 transition-transform group-open:rotate-90">
              ▸
            </span>
            <span className="shrink-0 rounded border border-border px-1 py-px font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              tool
            </span>
            <span className="truncate font-mono text-[12px] text-foreground/80">
              {name}
            </span>
          </summary>
          {inputPreview ? (
            <pre className="max-h-48 overflow-auto border-t border-border/60 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {inputPreview}
            </pre>
          ) : (
            <div className="border-t border-border/60 px-2.5 py-2 text-[11px] text-muted-foreground/70">
              No parameters
            </div>
          )}
        </details>
      </div>
    );
  }

  const isUser = message.role === "user";
  const text = isUser
    ? message.payload.message
    : message.payload.type === "text"
      ? message.payload.message
      : "";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground whitespace-pre-wrap"
            : "bg-muted text-foreground"
        }`}
      >
        {!isUser && (
          <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Assistant
          </div>
        )}
        {isUser ? text : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <Streamdown mode="static">{text}</Streamdown>
          </div>
        )}
      </div>
    </div>
  );
}

function Sidebar() {
  const { workspaces, setWorkspaces, activeSessionId, setActiveSessionId } = useContext(AppContext);
  const [path, setPath] = useState("");
  const [provider, setProvider] = useState<ProviderId>("claude");
  const [sessionError, setSessionError] = useState<string | null>(null);

  async function addWorkspace() {
    if (!path.trim()) return;
    const nextPath = path;
    setPath("");
    try {
      const workspace = await createWorkspace(nextPath);
      setWorkspaces((ws) => [...ws, { ...workspace, sessions: [] }]);
    } catch (err) {
      console.error("failed to create workspace", err);
    }
  }

  async function addSession(workspaceId: string) {
    if (!workspaceId) return;
    setSessionError(null);
    try {
      const session = await createSession(workspaceId, provider);
      setWorkspaces((ws) => ws.map((w) =>
        w.id === workspaceId
          ? { ...w, sessions: [...w.sessions, { id: session.id }] }
          : w
      ));
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "failed to create session");
    }
  }

  return (
    <div className="flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-3 py-3">
        <h1 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Workspaces
        </h1>
        <label className="mt-2 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Provider
          </span>
          <select
            value={provider}
            onChange={(e) => {
              const next = e.target.value;
              if (isProviderId(next)) setProvider(next);
            }}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            {PROVIDER_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        {sessionError && (
          <p className="mt-2 text-xs text-destructive">{sessionError}</p>
        )}
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {workspaces.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No workspaces yet
          </div>
        )}
        {workspaces.map((w) => (
          <WorkspaceItem
            key={w.id || w.path}
            workspace={w}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onAddSession={() => addSession(w.id)}
          />
        ))}
      </div>

      <div className="flex gap-2 border-t border-sidebar-border p-2">
        <input
          className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          placeholder="/path/to/workspace"
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void addWorkspace(); }}
        />
        <button
          onClick={() => void addWorkspace()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function WorkspaceItem({
  workspace,
  onAddSession,
  activeSessionId,
  onSelectSession,
}: {
  workspace: WorkspaceSummary;
  onAddSession: () => void;
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-md">
      <div
        className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate text-sm">
          {workspace.name || workspace.path}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onAddSession(); }}
          title="New session"
          className="shrink-0 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          + session
        </button>
      </div>

      {open && (
        <div className="ml-3 space-y-0.5 border-l border-sidebar-border pl-2">
          {workspace.sessions.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground">
              No sessions yet
            </div>
          )}
          {workspace.sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSession(s.id)}
              className={`block w-full truncate rounded px-2 py-1 text-left text-xs ${
                s.id === activeSessionId
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              Session {s.id.slice(-6)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
