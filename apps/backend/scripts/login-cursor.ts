import { Cursor } from "@cursor/sdk";

const result = await Cursor.auth.login();
console.log(`logged in as ${result.email ?? "ok"}`);
