import { connect, Server, Socket } from "net";
import { sleep as libSleep } from "@ms-smtp/lib/sleep";
import { expect } from "@jest/globals";
import { tryCloseSocket, waitSecured } from "../../../src/smtp/lib/socket.ts";
import { AddressInfo } from "node:net";
import { Certificate } from "@ms-smtp/common/lib/config";
import { connect as tlsConnect, TLSSocket } from "tls";
import { ConnectionOptions } from "node:tls";
import { SmtpDetectedProtocol, SmtpServer } from "../../../src/smtp/smtp_server.ts";
import { Waitable } from "../../../src/smtp/lib/waitable.ts";

/*
const jestConsole = console;
beforeEach(() => { global.console = console; });
afterEach(() => { global.console = jestConsole; });
*/

// Use real timers for timeouts during testing
const timeoutSet = setTimeout;
const timeoutClear = clearTimeout;

function sleep(ms: number, timeout: () => void) {
    return libSleep(ms, timeout, timeoutSet, timeoutClear);
}

class Timeout extends Error {
    constructor() {
        super("Timeout");
        this.name = "Timeout";
    }
}

async function closeSocket(socket?: Socket | null) {
    if (socket) {
        await tryCloseSocket(socket);
    }
}

export async function expectReadableEnded(socket: Socket | null) {
    if (socket && socket.isPaused()) {
        socket.resume();
    }
    if (socket && !socket.readableEnded) {
        const { promise: endedPromise, resolve, reject } = Promise.withResolvers<void>();

        const timeoutPromise = sleep(5000, () => { throw new Timeout(); });

        const onEnded = () => {
            resolve();
        }
        const onError = (err: Error) => {
            reject(err);
        }

        socket.once("end", onEnded);
        socket.once("error", onError);

        try {
            await Promise.race([endedPromise, timeoutPromise]);
        } finally {
            timeoutPromise.cancel();
            socket.off("end", onEnded);
            socket.off("error", onError);
        }
    }
}

async function expectData(socket: Socket, data: string, partial: boolean = false) {
    const { promise: dataPromise, resolve, reject } = Promise.withResolvers<boolean>();
    let buffer = Buffer.alloc(0);

    const timeoutPromise = sleep(5000, () => { throw new Timeout(); });
    const onData = (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length >= data.length) {
            resolve(true);
        }
    }
    const onError = (err: Error) => {
        reject(err);
    }

    socket.on("data", onData);
    socket.once("error", onError);
    try {
        if (socket.isPaused()) {
            socket.resume();
        }
        await Promise.race([dataPromise, timeoutPromise]);
    } catch (err) {
        // Ignore timeouts
        if (!(err instanceof Timeout)) {
            throw err;
        }
    } finally {
        timeoutPromise.cancel();
        socket.off("data", onData);
        socket.off("error", onError);
    }

    socket.pause();

    const received = buffer.toString("binary");
    if (partial && received.length > data.length) {
        socket.unshift(received.slice(data.length), "binary");
        expect(received.substring(0, data.length)).toEqual(data);
    } else {
        expect(received).toEqual(data);
    }
}

export class SpySmtpServer extends SmtpServer {
    private ended = new Waitable(true);
    protected async onConnection(socket: Socket | TLSSocket, protocolPromise: Promise<SmtpDetectedProtocol | null>): Promise<void> {
        const address: AddressInfo = {
            address: socket.remoteAddress!,
            port: socket.remotePort!,
            family: socket.remoteFamily!
        };

        const initialProtocol = await Promise.any([protocolPromise, undefined]);
        const initialConnectionType = await this.formatConnectionType(initialProtocol);
        console.info(`SMTP Test server: New ${ initialConnectionType } connection`, address);

        try {
            const protocol = await protocolPromise;
            if (protocol !== null) {
                const connectionType = await this.formatConnectionType(protocol);
                if (initialConnectionType !== connectionType) {
                    console.info(`Connection detected to be ${ connectionType }`, address);
                }
                await this.intercept(socket, protocol);
            }
            this.ended.set();
            console.info("Connection closed cleanly", address);
        } catch (err) {
            console.warn(`Connection closed with error: ${ (err instanceof Error && err.message) || err }`, address);
            this.ended.set(err);
        }
    }

    public async expectEnd() {
        await this.ended.promise;
    }

    public async expectError(message?: string | undefined, cause?: string | undefined) {
        let expectObject: {message?: string, cause?: string} | undefined;
        if (message) {
            expectObject = {};
            expectObject.message = message;
        }
        if (cause) {
            expectObject ??= {};
            expectObject.cause = cause;
        }

        if (!expectObject) {
            await expect(this.ended.promise).rejects.toThrow(expectObject);
        } else {
            await expect(this.ended.promise).rejects.toThrow();
        }
    }
}

export class MockClient {
    private socket: Socket | TLSSocket | null = null;
    private error: Error | null = null;

    constructor(private readonly host: string, private readonly port: number) {
    }

    public checkError() {
        if (this.error) {
            throw this.error;
        }
    }

    public async connect() {
        const { promise: connectPromise, resolve, reject } = Promise.withResolvers<void>();
        this.socket = connect({ host: this.host, port: this.port }, resolve);
        this.socket.once("error", reject);
        try {
            await connectPromise;
            this.socket.on("error", (err) => {
                this.error = err;
            });
        } finally {
            this.socket.off("error", reject);
        }
        return this;
    }

    public async close() {
        await closeSocket(this.socket);
    }

    public end(): void {
        this.socket?.end();
    }

    public async send(data: string | Buffer) {
        this.checkError();
        if (Buffer.isBuffer(data)) {
            this.socket!.write(data);
        } else {
            this.socket!.write(data, "binary");
        }
    }

    public async expectEnded() {
        this.checkError();
        await expectReadableEnded(this.socket);
    }

    public async expect(data: string) {
        this.checkError();
        await expectData(this.socket!, data);
        return this;
    }

    public async expectPartial(data: string) {
        this.checkError();
        await expectData(this.socket!, data, true);
        return this;
    }

    public async upgradeToTls(): Promise<void> {
        const tlsSocket = tlsConnect({
            rejectUnauthorized: false,
            socket: this.socket
        } as ConnectionOptions);

        this.socket = tlsSocket;
        // Prevent unhandled error event
        this.socket.on("error", () => {});
        await waitSecured(tlsSocket, false);
    }
}

export class MockServer {
    private server: Server | null = null;
    private socket: Socket | TLSSocket | null = null;

    private readonly host: string;
    private _port?: number;
    private readonly certificate?: Certificate;
    private readonly connections: Socket[] = [];

    public get port(): number {
        return this._port!;
    }

    constructor(host: string, port?: number | undefined, startTlsCertificate?: Certificate | undefined) {
        this.host = host;
        this._port = !!port ? port : undefined;
        this.certificate = startTlsCertificate;
    }

    public async listen() {
        const { promise: listenPromise, resolve } = Promise.withResolvers<void>();
        this.server = new Server();
        this.server.listen(this._port ?? 0, this.host, () => {
            this.server!.on("connection", (socket: Socket) => {
                socket.allowHalfOpen = true;
                this.connections.push(socket);
            });
            resolve();
        });

        const timeoutPromise = sleep(5000, () => { throw new Timeout(); });
        await Promise.race([listenPromise, timeoutPromise]);
        timeoutPromise.cancel();

        this._port = (this.server!.address() as AddressInfo).port;

        return this;
    }

    public async close() {
        await closeSocket(this.socket);
        this.socket = null;

        if (this.server && this.server.listening) {
            const { promise: closePromise, resolve } = Promise.withResolvers<void>();
            this.server.on("close", () => resolve());

            this.server.close();

            // Close pending connections
            let socket = this.connections.shift();
            while (socket) {
                await tryCloseSocket(socket);
                socket = this.connections.shift();
            }

            await closePromise;

            this.server = null;
        }
    }

    public async accept() {
        if (this.connections.length > 0) {
            this.socket = this.connections.shift()!;
        } else {
            const { promise: acceptPromise, resolve } = Promise.withResolvers<boolean>();
            this.server!.once("connection", (socket) => {
                this.socket = socket;
                this.socket.allowHalfOpen = true;
                resolve(true);
            });

            const timeoutPromise = sleep(5000, () => { throw new Timeout(); });
            await Promise.race([acceptPromise, timeoutPromise]);
            timeoutPromise.cancel();
        }
        return this;
    }

    public async send(data: string) {
        this.socket!.write(data, "binary");
        return this;
    }

    public end(): void {
        this.socket?.end();
    }

    public async expectEnded() {
        await expectReadableEnded(this.socket);
    }

    public async expect(data: string) {
        await expectData(this.socket!, data);
        return this;
    }

    public async expectPartial(data: string) {
        await expectData(this.socket!, data, true);
        return this;
    }

    public async upgradeToTls() {
        if (this.socket!.isPaused()) {
            this.socket!.resume();
        }

        const tlsSocket = new TLSSocket(this.socket!, { ...this.certificate!, isServer: true });
        tlsSocket.allowHalfOpen = true;

        this.socket = tlsSocket;

        // Prevent unhandled error event
        this.socket.on("error", () => {});

        await waitSecured(tlsSocket, true);
    }
}
