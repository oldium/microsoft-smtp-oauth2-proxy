import { Socket } from "net";

export default async function read(socket: Socket | null, closedPromise: Promise<null>): Promise<Buffer | null> {
    if (socket) {
        if (socket.closed) {
            return closedPromise;
        }
        if (socket.readableEnded) {
            return null;
        }

        const data = socket.read();
        if (data) {
            return data;
        }

        const { promise: dataPromise, resolve } = Promise.withResolvers<Buffer | null>();

        const onReadable = () => {
            resolve(socket.read());
        }
        const onEnd = () => {
            resolve(null);
        }

        // We do not need to handle close event, it is handled by closedPromise
        socket
            .once('readable', onReadable)
            .once('end', onEnd)

        try {
            return await Promise.race([dataPromise, closedPromise]);
        } finally {
            socket
                .off('readable', onReadable)
                .off('end', onEnd);
        }
    } else {
        return closedPromise;
    }
}
