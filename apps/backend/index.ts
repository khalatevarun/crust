import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import { WorkspaceModel } from "db";


mongoose.connect(process.env.DB_URL!)
.then(()=>{
    const server = new WebSocketServer({
        port: 3000
    });

    server.on("connection", (ws) => {
        ws.on("message", (msg) => {
            console.log(msg);
            WorkspaceModel.create({
                "path":"/my/computer",
                "name": "beginning"
            })
        })
    })
})
.catch((e)=>{
    console.log(e);
})