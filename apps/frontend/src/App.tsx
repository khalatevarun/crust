import "./index.css";
import { useContext, useEffect, useState } from "react";
import type { Message, ProviderId, WorkspaceSummary } from "commons";
import { DEFAULT_MODEL_ID, isProviderId, PROVIDER_IDS, PROVIDER_MODELS } from "commons";
import { AppContext } from "./context/AppContext";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { addMessage, createSession, createWorkspace, deleteDevice, deleteWorkspace, ensureDesktopToken, getSnapshot, listDevices, pairDevice, type DeviceInfo, type OriginKind } from "./api";
import { pairingOriginHint } from "./pairingOrigin";
import QRCode from "qrcode";
import { useSessionEvents } from "./hooks/useSessionEvents";

export function App() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [screen, setScreen] = useState<"chat" | "devices">("chat");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureDesktopToken()
      .then(() => getSnapshot())
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
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-muted-foreground text-sm">
        <p>{loadError}</p>
        <button
          className="rounded-md border border-border px-3 py-1.5 text-foreground"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ workspaces, setWorkspaces, activeSessionId, setActiveSessionId }}>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar onOpenDevices={() => setScreen("devices")} />
        {screen === "devices" ? (
          <DevicesScreen onBack={() => setScreen("chat")} />
        ) : (
          <ChatWindow />
        )}
      </div>
    </AppContext.Provider>
  );
}

function ChatWindow() {
  const { activeSessionId } = useContext(AppContext);
  const { messages, setMessages } = useSessionEvents(activeSessionId);
  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);

  function sendMessage() {
    const text = input.trim();
    if (!text || !activeSessionId) return;

    setSendError(null);
    setMessages((prev) => [...prev, { role: "user", payload: { message: text } }]);
    void addMessage(activeSessionId, text).catch((err) => {
      setSendError(err instanceof Error ? err.message : "failed to send");
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
        {sendError && <p className="text-xs text-destructive">{sendError}</p>}
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

function hasToolArgs(input: unknown): boolean {
  if (input === undefined || input === null) return false;
  if (typeof input === "string") return input.trim().length > 0;
  if (Array.isArray(input)) return input.length > 0;
  if (typeof input === "object") return Object.keys(input).length > 0;
  return true;
}

function toolArgsSummary(input: unknown): string | null {
  if (!hasToolArgs(input)) return null;
  if (typeof input === "string") return input;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return JSON.stringify(input);
  }
  return Object.entries(input)
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("  ");
}

function ChatBubble({ message }: { message: Message }) {
  if (message.role === "assistant" && message.payload.type === "tool-call") {
    const { name, input } = message.payload;
    const summaryArgs = toolArgsSummary(input);
    const inputPreview = hasToolArgs(input) ? JSON.stringify(input, null, 2) : null;

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
            <span className="min-w-0 truncate font-mono text-[12px] text-foreground/80">
              {name}
              {summaryArgs ? <span className="text-muted-foreground"> {summaryArgs}</span> : null}
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

function Sidebar({ onOpenDevices }: { onOpenDevices: () => void }) {
  const { workspaces, setWorkspaces, activeSessionId, setActiveSessionId } = useContext(AppContext);
  const [path, setPath] = useState("");
  const [provider, setProvider] = useState<ProviderId>("claude");
  const [model, setModel] = useState(DEFAULT_MODEL_ID.claude);
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
      const session = await createSession(workspaceId, provider, model);
      setWorkspaces((ws) => ws.map((w) =>
        w.id === workspaceId
          ? { ...w, sessions: [...w.sessions, { id: session.id }] }
          : w
      ));
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "failed to create session");
    }
  }

  async function removeWorkspace(workspace: WorkspaceSummary) {
    const sessionIds = new Set(workspace.sessions.map((session) => session.id));
    setWorkspaces((ws) => ws.filter((w) => w.id !== workspace.id));
    if (activeSessionId && sessionIds.has(activeSessionId)) {
      setActiveSessionId(null);
    }
    try {
      await deleteWorkspace(workspace.id);
      const data = await getSnapshot();
      setWorkspaces(data.workspaces);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "failed to delete workspace");
      try {
        const data = await getSnapshot();
        setWorkspaces(data.workspaces);
      } catch {
        return;
      }
    }
  }

  return (
    <div className="flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-3 py-3">
        <h1 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Workspaces
        </h1>
        <button
          onClick={onOpenDevices}
          className="mt-2 w-full cursor-pointer rounded-md border border-input px-2 py-1.5 text-left text-xs text-foreground hover:bg-sidebar-accent"
        >
          Devices
        </button>
        <label className="mt-2 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Provider
          </span>
          <select
            value={provider}
            onChange={(e) => {
              const next = e.target.value;
              if (!isProviderId(next)) return;
              setProvider(next);
              setModel(DEFAULT_MODEL_ID[next]);
              setSessionError(null);
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
        <label className="mt-2 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Model
          </span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            {PROVIDER_MODELS[provider].map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {sessionError && (
          <p className="mt-2 whitespace-pre-wrap text-xs text-destructive">{sessionError}</p>
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
            onDeleteWorkspace={() => void removeWorkspace(w)}
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
          className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
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
  onDeleteWorkspace,
  activeSessionId,
  onSelectSession,
}: {
  workspace: WorkspaceSummary;
  onAddSession: () => void;
  onDeleteWorkspace: () => void;
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
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onAddSession(); }}
            title="New session"
            className="cursor-pointer rounded px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            + session
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteWorkspace(); }}
            title="Delete workspace"
            className="cursor-pointer rounded px-1.5 text-xs text-destructive hover:bg-accent"
          >
            Delete
          </button>
        </div>
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
              className={`block w-full cursor-pointer truncate rounded px-2 py-1 text-left text-xs ${
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

function formatWhen(value?: string) {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function DevicesScreen({ onBack }: { onBack: () => void }) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [pairingKind, setPairingKind] = useState<OriginKind | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const data = await listDevices();
    setDevices(data.devices);
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "failed to load devices");
    });
  }, []);

  async function pair() {
    const nextName = name.trim();
    if (!nextName) return;
    setBusy(true);
    setError(null);
    try {
      const device = await pairDevice(nextName);
      setName("");
      const backendUrl = device.backendUrl;
      const payload = JSON.stringify({ token: device.token, backendUrl });
      const url = await QRCode.toDataURL(payload, { margin: 1, width: 220 });
      setQrUrl(url);
      setPairingUrl(backendUrl);
      setPairingKind(device.originKind);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to pair");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await deleteDevice(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to revoke");
    }
  }

  return (
    <div className="flex flex-1 flex-col min-w-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-sm font-medium">Devices</div>
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Back to chat
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="space-y-2">
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm">{device.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  paired {formatWhen(device.createdAt)} · last used {formatWhen(device.lastUsedAt)}
                </div>
              </div>
              <button
                onClick={() => void revoke(device.id)}
                className="shrink-0 text-xs text-destructive hover:underline"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            placeholder="Device name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void pair(); }}
          />
          <button
            onClick={() => void pair()}
            disabled={busy || !name.trim()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            Pair new device
          </button>
        </div>
        {qrUrl && (
          <div className="space-y-2">
            <img src={qrUrl} alt="Pairing QR code" className="h-[220px] w-[220px] rounded-md bg-white p-2" />
            {pairingUrl ? (
              <>
                <p className="font-mono text-[11px] text-muted-foreground break-all">{pairingUrl}</p>
                {pairingKind ? (
                  <p className="text-[11px] text-muted-foreground">{pairingOriginHint(pairingKind)}</p>
                ) : null}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
