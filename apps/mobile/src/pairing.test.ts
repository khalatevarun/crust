import { describe, expect, test } from "bun:test";
import { parsePairPayload } from "./pairing";

describe("parsePairPayload", () => {
    test("reads token and backendUrl", () => {
        expect(parsePairPayload(JSON.stringify({ token: "abc", backendUrl: "http://localhost:3001" }))).toEqual({
            token: "abc",
            backendUrl: "http://localhost:3001",
        });
    });

    test("rejects junk", () => {
        expect(parsePairPayload("not-json")).toBeNull();
        expect(parsePairPayload(JSON.stringify({ token: "abc" }))).toBeNull();
        expect(parsePairPayload(JSON.stringify({ token: "", backendUrl: "http://x" }))).toBeNull();
        expect(parsePairPayload(JSON.stringify({ token: "abc", backendUrl: "not a url" }))).toBeNull();
    });

    test("strips a trailing slash and ignores extra fields", () => {
        expect(parsePairPayload(JSON.stringify({
            token: "abc",
            backendUrl: "https://node.tailxxxxx.ts.net/",
            originKind: "tailscale-serve",
        }))).toEqual({
            token: "abc",
            backendUrl: "https://node.tailxxxxx.ts.net",
        });
    });
});
