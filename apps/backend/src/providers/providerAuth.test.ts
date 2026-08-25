import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { claudeIsConfigured } from "./ClaudeProvider";
import { codexIsConfigured } from "./CodexProvider";
import { cursorIsConfigured, cursorProvider } from "./CursorProvider";
import { geminiIsConfigured } from "./GeminiProvider";
import { opencodeIsConfigured } from "./OpencodeProvider";

function scratch(name: string): string {
    const home = join(tmpdir(), `crust-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(home, { recursive: true });
    return home;
}

test("claude is configured from a Claude Code login without an API key", () => {
    const home = scratch("claude-login");
    writeFileSync(
        join(home, ".claude.json"),
        JSON.stringify({ oauthAccount: { emailAddress: "dev@example.com" } }),
    );
    expect(claudeIsConfigured({}, home)).toBe(true);
});

test("codex is configured from ~/.codex/auth.json without OPENAI_API_KEY", () => {
    const home = scratch("codex-login");
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex/auth.json"), JSON.stringify({ tokens: { access: "x" } }));
    expect(codexIsConfigured({}, home)).toBe(true);
});

test("opencode is configured from auth.json without OPENCODE_API_KEY", () => {
    const home = scratch("opencode-login");
    const authPath = join(home, ".local/share/opencode");
    mkdirSync(authPath, { recursive: true });
    writeFileSync(join(authPath, "auth.json"), JSON.stringify({ anthropic: { type: "api", key: "x" } }));
    expect(opencodeIsConfigured({}, home)).toBe(true);
});

test("cursor is configured from ~/.cursor/sdk/auth.json without CURSOR_API_KEY", () => {
    const home = scratch("cursor-login");
    mkdirSync(join(home, ".cursor/sdk"), { recursive: true });
    writeFileSync(join(home, ".cursor/sdk/auth.json"), JSON.stringify({ apiKey: "cursor_x" }));
    expect(cursorIsConfigured({}, home)).toBe(true);
});

test("gemini is configured from a Gemini CLI login without GEMINI_API_KEY", () => {
    const home = scratch("gemini-login");
    mkdirSync(join(home, ".gemini"), { recursive: true });
    writeFileSync(join(home, ".gemini/oauth_creds.json"), JSON.stringify({ access_token: "ya29.x" }));
    expect(geminiIsConfigured({}, home)).toBe(true);
});

test("providers are unconfigured with empty home and no env credentials", () => {
    const home = scratch("empty");
    expect(claudeIsConfigured({}, home)).toBe(false);
    expect(codexIsConfigured({}, home)).toBe(false);
    expect(opencodeIsConfigured({}, home)).toBe(false);
    expect(cursorIsConfigured({}, home)).toBe(false);
    expect(geminiIsConfigured({}, home)).toBe(false);
});

test("cursor setup hint tells you the SDK login, not the Cursor app", () => {
    const hint = cursorProvider.setupHint();
    expect(hint).toContain("Signing into the Cursor app does not count");
    expect(hint).toContain("@cursor/sdk is already in the backend");
    expect(hint).toContain("bun run login:cursor");
    expect(hint).toContain("cursor.com/dashboard/integrations");
});
