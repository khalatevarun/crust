import { WebSocket } from "ws";
import { User } from "./User";
import { uuid } from "uuidv4";
import { WorkspaceModel, SessionModel } from "db";
import type { Workspace, Session, Message, OutgoingMessageType } from "commons";


export class UserManager {
    private users: User[];
    private static instance: UserManager;
    private constructor() {
        this.users = [];
    }

    static getInstance(): UserManager {
        if(UserManager.instance){
            return UserManager.instance
        }

        UserManager.instance = new UserManager();
        return UserManager.instance
    }

    async addUser(ws: WebSocket) {
        const id = uuid();
        const user = new User(id, ws);
        this.users.push(user);

        // Buffer messages until init is sent so early creates aren't dropped
        // and aren't wiped by a stale init snapshot.
        const pending: WebSocket.RawData[] = [];
        let ready = false;

        const handleMessage = async (msg: WebSocket.RawData) => {
            try {
                const parsedMessage = JSON.parse(msg.toString());
                const responsePayload = await user.handleIncomingMessage(parsedMessage);
                user.sendMessage(responsePayload);
            } catch(e){
                console.error("Error handling message", e);
                console.log(msg.toString())
            }
        };

        ws.on("message", async (msg) => {
            if (!ready) {
                pending.push(msg);
                return;
            }
            await handleMessage(msg);
        })

        ws.on("close", () => {
            this.users = this.users.filter(x => x.id != id);
        })

        const workspaces = await WorkspaceModel.find();
        const sessions = await SessionModel.find();

        const response: Workspace[] = []

        for (let w of workspaces){
            const finalSessions: Session[] = [];
            for(let s of sessions) {
                if(s.workspaceId?.toString() === w._id.toString()) {
                     finalSessions.push({
                        id: s._id.toString(),
                        messages: s.conversation as unknown as Message[]
                     })
                }
            }
            response.push({
                id: w._id.toString(),
                name: w.name ?? "",
                path: w.path ?? "",
                sessions: finalSessions
            })
        }

        ws.send(JSON.stringify(
            {
                type: "init",
                workspaces: response
            } satisfies OutgoingMessageType
        ))

        ready = true;
        for (const msg of pending) {
            await handleMessage(msg);
        }
    }
}
