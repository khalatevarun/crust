import { useSocket } from "./hooks/useSocket";
import "./index.css";
import { useContext, useEffect, useState } from "react";
import type { Message, OutgoingMessageType, Workspace } from "commons"
import { AppContext } from "./context/AppContext";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";


export function App() {

  const { loading, socket } = useSocket();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    socket.onmessage = (event) => {
      const parsedData: OutgoingMessageType = JSON.parse(event.data);
      if (parsedData.type === "init") {
        setWorkspaces(prev => {
          const pending = prev.filter(w => w.id === "");
          const merged = [...parsedData.workspaces];
          for (const p of pending) {
            if (!merged.some(w => w.path === p.path)) {
              merged.push(p);
            }
          }
          return merged;
        })
      }
      if (parsedData.type === "workspace-created") {
        setWorkspaces(workspaces => {
          let found = false;
          const next = workspaces.map(w => {
            if (w.id === "" && w.path === parsedData.payload.path) {
              found = true;
              return {
                ...w,
                ...parsedData.payload
              }
            }
            return w;
          });
          if (!found) {
            next.push({ ...parsedData.payload, sessions: [] });
          }
          return next;
        })
      }
      if (parsedData.type === "create-session") {
        setWorkspaces(workspaces => workspaces.map(w => {
          if (w.id !== parsedData.payload.workspaceId) return w;
          let replaced = false;
          const sessions = w.sessions.map(s => {
            if (!replaced && s.id === "") {
              replaced = true;
              return { ...s, id: parsedData.payload.id };
            }
            return s;
          });
          if (!replaced) {
            sessions.push({ id: parsedData.payload.id, messages: [] });
          }
          return { ...w, sessions };
        }))
      }
      if (parsedData.type === "assistant-message") {
        const { sessionId, message } = parsedData.payload;
        if (!sessionId || !message) return;
        setWorkspaces(workspaces => workspaces.map(w => ({
          ...w,
          sessions: w.sessions.map(s => s.id !== sessionId ? s : {
            ...s,
            messages: [...s.messages, { role: "assistant", payload: { type: "text", message } }]
          })
        })))
      }
      if (parsedData.type === "tool-call") {
        const { sessionId, id, name, input } = parsedData.payload;
        if (!sessionId || !name) return;
        setWorkspaces(workspaces => workspaces.map(w => ({
          ...w,
          sessions: w.sessions.map(s => s.id !== sessionId ? s : {
            ...s,
            messages: [...s.messages, {
              role: "assistant",
              payload: { type: "tool-call", id, name, input }
            }]
          })
        })))
      }
    }
  }, [socket])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground text-sm">
        Connecting...
      </div>
    )
  }


  return (
    <AppContext.Provider value={{ workspaces, socket, setWorkspaces, activeSessionId, setActiveSessionId }}>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar />
        <ChatWindow />
      </div>
    </AppContext.Provider>
  );
}

function ChatWindow() {
  const { socket, workspaces, setWorkspaces, activeSessionId } = useContext(AppContext);
  const [input, setInput] = useState("");

  const session = workspaces
    .flatMap(w => w.sessions)
    .find(s => s.id === activeSessionId);

  function sendMessage() {
    const text = input.trim();
    if (!text || !activeSessionId) return;

    setWorkspaces(ws => ws.map(w => ({
      ...w,
      sessions: w.sessions.map(s => s.id !== activeSessionId ? s : {
        ...s,
        messages: [...s.messages, { role: "user", payload: { message: text } }]
      })
    })));

    socket?.send(JSON.stringify({
      type: "add-message",
      payload: { sessionId: activeSessionId, message: text }
    }));
    setInput("");
  }

  if (!activeSessionId || !session) {
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
        {session.messages.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No messages yet. Say hello.
          </div>
        )}
        {session.messages.map((m, i) => (
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

  const { socket, workspaces, setWorkspaces, activeSessionId, setActiveSessionId } = useContext(AppContext);
  const [path, setPath] = useState("");

  function addWorkspace() {
    if (!path.trim()) return;

    setWorkspaces(w => [...w, {
      id: "",
      name: "",
      path: path,
      sessions: []
    }])
    socket?.send(JSON.stringify({
      type: "create-workspace",
      payload: {
        path,
      }
    }))
    setPath("")
  }

  function addSession(workspaceId: string) {
    if (!workspaceId) return;

    setWorkspaces(ws => ws.map(w => w.id === workspaceId ? {
      ...w,
      sessions: [...w.sessions, { id: "", messages: [] }]
    } : w));

    socket?.send(JSON.stringify({
      type: "create-session",
      payload: { workspaceId }
    }))
  }

  return (
    <div className="flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-3 py-3">
        <h1 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Workspaces
        </h1>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {workspaces.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No workspaces yet
          </div>
        )}
        {workspaces.map(w => (
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
          onKeyDown={(e) => { if (e.key === "Enter") addWorkspace(); }}
        />
        <button
          onClick={addWorkspace}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Add
        </button>
      </div>
    </div>
  )
}

function WorkspaceItem({
  workspace,
  onAddSession,
  activeSessionId,
  onSelectSession,
}: {
  workspace: Workspace,
  onAddSession: () => void,
  activeSessionId: string | null,
  onSelectSession: (id: string) => void,
}) {
  const [open, setOpen] = useState(true);
  const pending = workspace.id === "";

  return (
    <div className="rounded-md">
      <div
        className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={() => setOpen(o => !o)}
      >
        <span className={`truncate text-sm ${pending ? "italic text-muted-foreground" : ""}`}>
          {workspace.name || workspace.path || "Creating..."}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onAddSession(); }}
          disabled={pending}
          title="New session"
          className="shrink-0 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
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
          {workspace.sessions.map((s, i) => (
            <button
              key={s.id || `pending-${i}`}
              disabled={!s.id}
              onClick={() => onSelectSession(s.id)}
              className={`block w-full truncate rounded px-2 py-1 text-left text-xs disabled:cursor-not-allowed ${
                s.id === activeSessionId
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : s.id === ""
                    ? "italic text-muted-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              {s.id ? `Session ${s.id.slice(-6)}` : "Creating..."}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default App;
