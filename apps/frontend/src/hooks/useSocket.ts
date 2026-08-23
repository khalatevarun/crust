import { useEffect, useState } from "react"

export function useSocket() {
    const [ws, setWs] = useState<WebSocket | null>(null)
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const socket = new WebSocket("ws://localhost:3001");
        setWs(socket);

        socket.onopen = () => {
            setLoading(false);
        };

        return () => {
            socket.close();
        };
    }, [])

    return {
        socket: ws,
        loading
    }
}
