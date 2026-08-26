import { expect, test } from "bun:test";
import { advertisedBackendUrl } from "./advertisedUrl";

test("CRUST_BACKEND_URL wins and drops a trailing slash", () => {
    expect(advertisedBackendUrl({
        port: 3001,
        env: { CRUST_BACKEND_URL: "https://crust.example.ts.net/" },
    })).toBe("https://crust.example.ts.net");
});

test("without env, the url is http on the given port", () => {
    const url = advertisedBackendUrl({ port: 3001, env: {} });
    expect(/^http:\/\/[^/]+:3001$/.test(url)).toBe(true);
});
