import { claudeProvider } from "./ClaudeProvider";
import { codexProvider } from "./CodexProvider";
import { cursorProvider } from "./CursorProvider";
import { geminiProvider } from "./GeminiProvider";
import { opencodeProvider } from "./OpencodeProvider";
import type { Provider } from "./Provider";
import type { ProviderId } from "commons";

export const providerRegistry: Record<ProviderId, Provider> = {
    claude: claudeProvider,
    codex: codexProvider,
    opencode: opencodeProvider,
    cursor: cursorProvider,
    gemini: geminiProvider,
};
