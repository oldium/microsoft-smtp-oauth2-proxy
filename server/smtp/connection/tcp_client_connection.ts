import { Socket } from 'net';
import { TlsOptions, TLSSocket } from 'tls';
import { tryCloseSocket, waitSecured } from '../lib/socket';
import libRead from "../lib/read";
import { TypedEmitter } from "tiny-typed-emitter";
import { Waitable } from "../lib/waitable";
import assert from "node:assert";
import { AlreadySecuredException } from "../lib/exceptions";

interface TcpClientConnectionEvents {
    "close": () => void;
    "error": (err: Error) => void;
    "end": () => void;
};

export class TcpClientConnection extends TypedEmitter<TcpClientConnectionEvents> {
    private socket: Socket | TLSSocket | null = null;
    private _secured: boolean;
    private unregisterListeners: () => void = () => {};

    private readonly closed = new Waitable(null);

    constructor(socket: Socket, secured: boolean) {
        super();

        this.socket = socket;
        this.socket.allowHalfOpen = true;
        this._secured = secured;

        this.registerListeners();
    }

    public get secured(): boolean {
        return this._secured;
    }

    public isEnded(): boolean {
        return !this.socket || this.socket?.readableEnded;
    }

    public end() {
        this.socket?.end();
    }

    private registerListeners() {
        if (this.socket) {
            const onClose = async () => {
                return this.handleClose();
            }
            const onError = async (err: Error) => {
                return this.handleError(err);
            }
            const onEnd = async () => {
                return this.handleEnd();
            }

            this.socket
                .on('close', onClose)
                .on('error', onError)
                .on("end", onEnd);

            this.unregisterListeners = () => {
                this.socket?.off('close', onClose);
                this.socket?.off('error', onError);
                this.socket?.off("end", onEnd);
                this.unregisterListeners = () => {};
            }
        }
    }

    public unshift(data: Buffer): void {
        if (data.length !== 0) {
            this.socket?.unshift(data);
        }
    }

    public async read(): Promise<Buffer | null> {
        return await libRead(this.socket, this.closed.promise);
    }

    private async handleClose() {
        this.socket = null;
        this.closed.set();
        process.nextTick(() => this.emit("close"));
    }

    private async handleError(err: Error) {
        this.closed.set(err);
        process.nextTick(() => this.emit("error", err));
    }

    private async handleEnd() {
        process.nextTick(() => this.emit("end"));
    }

    public write(data: Buffer | string): void {
        if (Buffer.isBuffer(data)) {
            this.socket?.write(data);
        } else {
            this.socket?.write(data, "binary");
        }
    }

    public async upgradeToTls(options?: TlsOptions): Promise<void> {
        assert(this.socket, "socket is null!");

        if (this._secured) {
            throw new AlreadySecuredException("Client connection is already secured");
        }

        this.unregisterListeners();

        // We act as a server for the client connection
        const tlsSocket = new TLSSocket(this.socket, { ...options, isServer: true });
        tlsSocket.allowHalfOpen = true;

        this.socket = tlsSocket;
        await waitSecured(tlsSocket, true, this.registerListeners.bind(this), this.closed.promise);
        this._secured = true;
    }

    public async close(err?: unknown): Promise<void> {
        try {
            await tryCloseSocket(this.socket, err !== undefined);
        } catch {
            // Ignore
        }
    }
}
