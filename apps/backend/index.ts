import mongoose from "mongoose";
import { sessionHub } from "./src/http/SessionHub";
import { createServer } from "./src/http/server";
import { providerRegistry } from "./src/providers/registry";
import { chatRepository } from "./src/repository/ChatRepository";
import { deviceRepository } from "./src/repository/DeviceRepository";

mongoose
    .connect(process.env.DB_URL!)
    .then(() => {
        const server = createServer({
            repo: chatRepository,
            providers: providerRegistry,
            hub: sessionHub,
            devices: deviceRepository,
            port: 3001,
        });
        console.log(`HTTP server running at ${server.url}`);
    })
    .catch((e) => {
        console.log(e);
    });
