import type { ProviderId } from "commons";
import { claudeProvider } from "./ClaudeProvider";
import { codexProvider } from "./CodexProvider";
import { cursorProvider } from "./CursorProvider";
import { geminiProvider } from "./GeminiProvider";
import { opencodeProvider } from "./OpencodeProvider";
import type { Provider } from "./Provider";

export const PROVIDER_CREDENTIAL: Record<ProviderId, string> = {
    claude: "ANTHROPIC_API_KEY",
    codex: "OPENAI_API_KEY",
    opencode: "OPENCODE_API_KEY",
    cursor: "CURSOR_API_KEY",
    gemini: "GEMINI_API_KEY",
};

export const providerRegistry: Record<ProviderId, Provider> = {
    claude: claudeProvider,
    codex: codexProvider,
    opencode: opencodeProvider,
    cursor: cursorProvider,
    gemini: geminiProvider,
};
