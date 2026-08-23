import type { WorkspaceSummary } from "commons";
import { createContext, type Dispatch, type SetStateAction } from "react";

export const AppContext = createContext<{
    workspaces: WorkspaceSummary[];
    setWorkspaces: Dispatch<SetStateAction<WorkspaceSummary[]>>;
    activeSessionId: string | null;
    setActiveSessionId: Dispatch<SetStateAction<string | null>>;
}>({
    workspaces: [],
    setWorkspaces: () => {},
    activeSessionId: null,
    setActiveSessionId: () => {},
});
