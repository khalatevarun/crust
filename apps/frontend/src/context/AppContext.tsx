import type { Workspace } from "commons";
import { createContext, type Dispatch, type SetStateAction } from "react";

export const AppContext = createContext<
{
    workspaces: Workspace[],
    socket: WebSocket | null,
    setWorkspaces: Dispatch<SetStateAction<Workspace[]>>,
    activeSessionId: string | null,
    setActiveSessionId: Dispatch<SetStateAction<string | null>>,
}>({
    workspaces: [],
    socket: null,
    setWorkspaces: () => {},
    activeSessionId: null,
    setActiveSessionId: () => {},
});

