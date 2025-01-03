import { connect, Socket } from 'net';
import { connect as tlsConnect, TLSSocket } from 'tls';
import { tryCloseSocket, waitSecured } from '../lib/socket';
import libRead from "../lib/read";
import { TypedEmitter } from "tiny-typed-emitter";
import assert from "node:assert";
import { ConnectionOptions } from "node:tls";
import { isIP } from "node:net";
import Address from "ipaddr.js";
import { Waitable } from "../lib/waitable";
import { AlreadySecuredException } from "../lib/exceptions";

interface TcpServerConnectionEvents {
    "close": () => void;
    "error": (err: Error) => void;
}

export class TcpServerConnection extends TypedEmitter<TcpServerConnectionEvents> {
    private socket: Socket | TLSSocket | null = null;
    private readonly host: string;
    private readonly port: number;
    private readonly secure: boolean;
    private _secured: boolean;
    private unregisterListeners: () => void = () => {};

    private readonly closed = new Waitable(null);

    constructor(host: string, port: number, secure: boolean, secured: boolean) {
        super();

        this.host = host;
        this.port = port;
        this.secure = secure;
        this._secured = secured || secure;
    }

    public get secured(): boolean {
        return this._secured;
    }

    public async connect(): Promise<void> {
        const { promise, resolve, reject } = Promise.withResolvers<void>();

        // noinspection SpellCheckingInspection
        if (this.secure) {
            const servername = isIP(this.host) ? undefined : this.host;

            // Accept self-signed on loopback addresses
            let rejectUnauthorized: boolean | undefined;
            if (process.env.NODE_ENV === "test") {
                // noinspection SpellCheckingInspection
                rejectUnauthorized = !(isIP(this.host) && Address.parse(this.host).range() === "loopback");
            }

            this.socket = tlsConnect({
                host: this.host,
                port: this.port,
                servername,
                rejectUnauthorized,
            });
        } else {
            this.socket = connect({ host: this.host, port: this.port });
        }

        const onConnectError = (err: Error) => {
            this.socket?.off('connect', onConnect);
            this.socket?.off('secureConnect', onConnect);
            this.closed.set(err);
            reject(err);
        }

        const onConnect = () => {
            this.socket?.off('error', onConnectError);
            this.registerListeners();
            resolve();
        }

        if (this.secure) {
            this.socket
                .once('secureConnect', onConnect);
        } else {
            this.socket
                .once('connect', onConnect)
        }

        this.socket
            .once('error', onConnectError);

        await promise;
    }

    private registerListeners() {
        const onClose = () => {
            this.handleClose();
        }
        const onError = (err: Error) => {
            this.handleError(err);
        }

        this.socket?.on('close', onClose);
        this.socket?.on('error', onError);

        this.unregisterListeners = () => {
            this.socket?.off('close', onClose);
            this.socket?.off('error', onError);
            this.unregisterListeners = () => {
            };
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

    private handleClose() {
        this.socket = null;
        this.closed.set();
        process.nextTick(() => this.emit("close"));
    }

    private handleError(err: Error) {
        this.closed.set(err);
        process.nextTick(() => this.emit("error", err));
    }

    public write(data: Buffer | string): void {
        if (Buffer.isBuffer(data)) {
            this.socket?.write(data);
        } else {
            this.socket?.write(data, "binary");
        }
    }

    public end(): void {
        this.socket?.end();
    }

    public async upgradeToTls(options?: ConnectionOptions): Promise<void> {
        assert(this.socket, "socket is null!");

        if (this._secured) {
            throw new AlreadySecuredException("Server connection is already secured");
        }

        this.unregisterListeners();

        const servername = isIP(this.host) ? undefined : this.host;

        let rejectUnauthorized: boolean | undefined;
        if (process.env.NODE_ENV === "test") {
            // noinspection SpellCheckingInspection
            rejectUnauthorized = !(isIP(this.host) && Address.parse(this.host).range() === "loopback");
        }

        // We act as a client for the server connection
        const tlsSocket = tlsConnect({
            ...options,
            servername,
            rejectUnauthorized,
            socket: this.socket
        });

        this.socket = tlsSocket;
        await waitSecured(tlsSocket, false, this.registerListeners.bind(this), this.closed.promise);
        this._secured = true;
    }

    public async close(err?: unknown): Promise<void> {
        await tryCloseSocket(this.socket, err !== undefined);
    }
}
