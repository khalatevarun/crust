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
    });
});
