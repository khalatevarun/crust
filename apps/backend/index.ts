import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import { ConnectionManager } from "./src/ws/ConnectionManager";


mongoose.connect(process.env.DB_URL!)
.then(()=>{
    const server = new WebSocketServer({
        port: 3001
    });

    server.on("connection", (ws) => {
        ConnectionManager.getInstance().addConnection(ws);
    })
})
.catch((e)=>{
    console.log(e);
})