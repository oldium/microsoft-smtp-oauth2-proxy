import { Socket } from 'net';
import { CancellablePromise, sleep } from "../../lib/sleep";
import { ConnectionClosedException } from "./exceptions";
import { TLSSocket } from "tls";

const DESTROY_TIMEOUT_MS = 30000;

export async function tryCloseSocket(socket: Socket | null, forceDestroy?: boolean) {
    if (socket && !socket.closed) {
        const { promise: closedPromise, resolve } = Promise.withResolvers<void>();

        let timeoutPromise: CancellablePromise<void> | undefined;

        const onClose = () => {
            timeoutPromise?.cancel();
            resolve();
        }

        socket
            .once('close', onClose);

        // Now lead to close event
        if (socket.destroyed) {
            // Destroy has been called already
        } else {
            if (!forceDestroy) {
                timeoutPromise = sleep(DESTROY_TIMEOUT_MS);
                timeoutPromise.then(() => {
                    if (!socket.destroyed) {
                        socket.destroy();
                    }
                });
                socket.destroySoon();
            } else {
                socket.destroy();
            }
        }

        await closedPromise;
    }
}

export async function waitSecured(tlsSocket: TLSSocket, isServerSocket: boolean, init?: (() => void) | undefined, closedPromise?: Promise<null>) {
    const { promise: secureConnectPromise, resolve, reject } = Promise.withResolvers<void>();

    const onClose = () => {
        reject(new ConnectionClosedException('TLS connection closed'));
    }
    // noinspection DuplicatedCode
    const onError = (err: Error) => {
        reject(err);
    }

    // "secure" event is emitted always, on client socket we want secureConnect
    const onSecure = isServerSocket ? () => {
        resolve();
    } : undefined;
    // "secureConnect" event is emitted by client socket after verifying certificate
    const onSecureConnect = !isServerSocket ? () => {
        resolve();
    } : undefined;

    tlsSocket
        .once('close', onClose)
        .once('error', onError);

    if (onSecure) {
        tlsSocket.once('secure', onSecure);
    }
    if (onSecureConnect) {
        tlsSocket.once('secureConnect', onSecureConnect);
    }

    init?.call(null);

    try {
        let result;
        if (closedPromise) {
            result = await Promise.race([secureConnectPromise, closedPromise]);
        } else {
            result = await secureConnectPromise;
        }

        if (result === null) {
            throw new ConnectionClosedException("Connection closed");
        }
    } finally {
        tlsSocket
            .off('close', onClose)
            .off('error', onError);
        if (onSecure) {
            tlsSocket.off('secure', onSecure);
        }
        if (onSecureConnect) {
            tlsSocket.off('secureConnect', onSecureConnect);
        }
    }
}
