import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import { WorkspaceModel } from "db";
import { CreateWorkspaceSchema } from "commons";
import { UserManager } from "./UserManager";


mongoose.connect(process.env.DB_URL!)
.then(()=>{
    const server = new WebSocketServer({
        port: 3001
    });

    server.on("connection", (ws) => {
        UserManager.getInstance().addUser(ws);
    })
})
.catch((e)=>{
    console.log(e);
})