import type { Server } from "node:http";
import type { Socket } from "node:net";

const connections = new Set<Socket>();
const busy = new Set<Socket>();
let closed = false;

export function traceConnections(server: Server) {
    server.on("connection", (socket) => {
        connections.add(socket);
        socket.on("close", () => {
            connections.delete(socket);
        });
    });

    server.on("request", (req, res) => {
        const socket = req.socket;
        busy.add(socket);
        res.on("finish", () => {
            busy.delete(socket);
            if (closed) {
                socket.destroy();
            }
        });
    })
}

export function closeIdleConnections() {
    closed = true;
    connections.forEach((socket) => {
        if (!busy.has(socket)) {
            socket.destroy();
        }
    })
}
