import { Certificate, SmtpInterceptorOptions, TcpSecureServerOptions, TcpServerOptions } from "../lib/config";
import { Server as TLSServer, TLSSocket } from "tls";
import { Server, Socket } from "net";
import { SmtpInterceptor, UserAuthorization } from "./protocol/smtp_interceptor";
import { AddressInfo } from "node:net";
import { Waitable } from "./lib/waitable";
import _ from "lodash";
import { tryCloseSocket } from "./lib/socket";

export class SmtpServer {
    private readonly onUserAuth: UserAuthorization;
    private readonly options: SmtpInterceptorOptions;
    private readonly smtpServers?: Server[];
    private readonly _smtpLocalAddresses?: (AddressInfo | undefined)[];
    private readonly _smtpAddresses?: (string | undefined)[];
    private readonly _smtpPorts?: (number | undefined)[];
    private readonly _smtpTlsLocalAddresses?: (AddressInfo | undefined)[];
    private readonly smtpTlsServers?: TLSServer[];
    private readonly _smtpTlsAddresses?: (string | undefined)[];
    private readonly _smtpTlsPorts?: (number | undefined)[];
    private readonly _smtpStartTlsLocalAddresses?: (AddressInfo | undefined)[];
    private readonly smtpStartTlsServers?: Server[];
    private readonly _smtpStartTlsAddresses?: (string | undefined)[];
    private readonly _smtpStartTlsPorts?: (number | undefined)[];
    private readonly startTlsServerCertificate?: Certificate;
    private readonly connections: Set<SmtpInterceptor> = new Set<SmtpInterceptor>();
    private connectionsEmpty: Waitable | null = null;
    private isListening: boolean = false;
    private readonly pendingConnections: { socket: Socket, secure: boolean }[] = [];

    constructor(options: SmtpInterceptorOptions, onUserAuth: UserAuthorization, smtpConfig?: TcpServerOptions, smtpTlsConfig?: TcpSecureServerOptions, smtpStartTlsConfig?: TcpSecureServerOptions) {
        this.onUserAuth = onUserAuth;
        this.options = options;

        if (smtpConfig) {
            this.smtpServers = [];
            this._smtpLocalAddresses = [];
            this._smtpAddresses = [];
            this._smtpPorts = [];
            smtpConfig.addresses.forEach((address) => {
                this.smtpServers!.push(new Server());
                this._smtpLocalAddresses!.push(undefined);
                this._smtpAddresses!.push(address ? address : undefined);
                this._smtpPorts!.push((!!smtpConfig.port) ? smtpConfig.port : undefined);
            });
        }

        if (smtpTlsConfig) {
            this.smtpTlsServers = [];
            this._smtpTlsLocalAddresses = [];
            this._smtpTlsAddresses = [];
            this._smtpTlsPorts = [];
            smtpTlsConfig.addresses.forEach((address) => {
                this.smtpTlsServers!.push(new TLSServer(smtpTlsConfig));
                this._smtpTlsLocalAddresses!.push(undefined);
                this._smtpTlsAddresses!.push(address ? address : undefined);
                this._smtpTlsPorts!.push((!!smtpTlsConfig.port) ? smtpTlsConfig.port : undefined);
            });
        }

        if (smtpStartTlsConfig) {
            this.smtpStartTlsServers = [];
            this._smtpStartTlsLocalAddresses = [];
            this._smtpStartTlsAddresses = [];
            this._smtpStartTlsPorts = [];
            this.startTlsServerCertificate = smtpStartTlsConfig;

            smtpStartTlsConfig.addresses.forEach((address) => {
                this.smtpStartTlsServers!.push(new Server());
                this._smtpStartTlsLocalAddresses!.push(undefined);
                this._smtpStartTlsAddresses!.push(address ? address : undefined);
                this._smtpStartTlsPorts!.push((!!smtpStartTlsConfig.port) ? smtpStartTlsConfig.port : undefined);
            });
        }
    }

    public get smtpLocalAddresses(): (AddressInfo | undefined)[] | undefined {
        return this._smtpLocalAddresses;
    }

    // noinspection JSUnusedGlobalSymbols
    public get smtpAddresses(): (string | undefined)[] | undefined {
        return this._smtpAddresses;
    }

    public get smtpPorts(): (number | undefined)[] | undefined {
        return this._smtpPorts;
    }

    public get smtpTlsLocalAddresses(): (AddressInfo | undefined)[] | undefined {
        return this._smtpTlsLocalAddresses;
    }

    // noinspection JSUnusedGlobalSymbols
    public get smtpTlsAddresses(): (string | undefined)[] | undefined {
        return this._smtpTlsAddresses;
    }

    public get smtpTlsPorts(): (number | undefined)[] | undefined {
        return this._smtpTlsPorts;
    }

    public get smtpStartTlsLocalAddresses(): (AddressInfo | undefined)[] | undefined {
        return this._smtpStartTlsLocalAddresses;
    }

    // noinspection JSUnusedGlobalSymbols
    public get smtpStartTlsAddresses(): (string | undefined)[] | undefined {
        return this._smtpStartTlsAddresses;
    }

    public get smtpStartTlsPorts(): (number | undefined)[] | undefined {
        return this._smtpStartTlsPorts;
    }

    public async listen(): Promise<void> {
        const promises: Promise<void>[] = [];
        if (this.smtpServers) {
            _.zip(this.smtpServers!, this._smtpAddresses!, this._smtpPorts!).forEach(([server, address, port], index) => {
                promises.push(this.serverListen(server!, port ?? 0, address));
                server!.once("listening", () => {
                    const address = server!.address() as AddressInfo;
                    this._smtpLocalAddresses![index] = address;
                    this._smtpAddresses![index] = address.address;
                    this._smtpPorts![index] = address.port;
                });
            });
        }
        if (this.smtpTlsServers) {
            _.zip(this.smtpTlsServers!, this._smtpTlsAddresses!, this._smtpTlsPorts!).forEach(([server, address, port], index) => {
                promises.push(this.serverListen(server!, port ?? 0, address));
                server!.once("listening", () => {
                    const address = server!.address() as AddressInfo;
                    this._smtpTlsLocalAddresses![index] = address;
                    this._smtpTlsAddresses![index] = address.address;
                    this._smtpTlsPorts![index] = address.port;
                });
            });
        }
        if (this.smtpStartTlsServers) {
            _.zip(this.smtpStartTlsServers!, this._smtpStartTlsAddresses!, this._smtpStartTlsPorts!).forEach(([server, address, port], index) => {
                promises.push(this.serverListen(server!, port ?? 0, address));
                server!.once("listening", () => {
                    const address = server!.address() as AddressInfo;
                    this._smtpStartTlsLocalAddresses![index] = address;
                    this._smtpStartTlsAddresses![index] = address.address;
                    this._smtpStartTlsPorts![index] = address.port;
                });
            });
        }

        if (promises.length === 0) {
            throw new Error("No SMTP server ports specified to listen on");
        }

        // Notify when both servers either start listening or fail
        try {
            this.smtpServers?.forEach(server => server.on("connection", (socket) => this.onConnection(socket, true)));
            this.smtpTlsServers?.forEach(server => server.on("secureConnection", (socket) => this.onConnection(socket, true)));
            this.smtpStartTlsServers?.forEach(server => server.on("connection", (socket) => this.onConnection(socket, false)));

            await Promise.all(promises);

            this.isListening = true;

            this.processPendingConnections();
        } finally {
            await Promise.allSettled(promises);
        }
    }

    private async serverListen(server: Server | TLSServer, port: number, address?: string | undefined) {
        const { promise: listenPromise, resolve, reject } = Promise.withResolvers<void>();
        const onListening = () => {
            server.off("error", onError);
            resolve();
        }
        const onError = (err: Error) => {
            server.off("listening", onListening);
            reject(err);
        }
        server
            .once("listening", onListening)
            .once("error", onError);
        server.listen(port, ...(address ? [address] : []));
        await listenPromise;
    }

    private async closeServer(server: Server | TLSServer) {
        if (server.listening) {
            const { promise: closePromise, resolve } = Promise.withResolvers<void>();
            server.once("close", () => process.nextTick(resolve));
            server.close();
            await closePromise;
        }
    }

    public async close() {
        const promises: Promise<void>[] = [];

        this.isListening = false;

        this.smtpServers?.forEach(server => promises.push(this.closeServer(server)));
        this.smtpTlsServers?.forEach(server => promises.push(this.closeServer(server)));
        this.smtpStartTlsServers?.forEach(server => promises.push(this.closeServer(server)));

        try {
            await Promise.all(promises);
        } catch (err) {
            console.error("Error closing server", err);
        } finally {
            await Promise.allSettled(promises);
        }

        await this.closePendingConnections();

        if (this.connections.size > 0) {
            // Wait for all loops to finish
            this.connectionsEmpty = new Waitable<void>();
            await this.connectionsEmpty.promise;
        }
    }

    private processPendingConnections() {
        while (this.pendingConnections.length > 0) {
            const { socket, secure } = this.pendingConnections.shift()!;
            // noinspection JSIgnoredPromiseFromCall
            this.onConnection(socket, secure);
        }
    }

    private async closePendingConnections() {
        while (this.pendingConnections.length > 0) {
            const { socket } = this.pendingConnections.shift()!;
            try {
                await tryCloseSocket(socket, true);
            } catch (err) {
                console.error("Error closing pending connection", err);
            }
        }
    }

    protected async onConnection(socket: Socket | TLSSocket, secure: boolean) {
        if (!this.isListening) {
            this.pendingConnections.push({ socket, secure });
            return;
        }

        const address: AddressInfo = {
            address: socket.remoteAddress!,
            port: socket.remotePort!,
            family: socket.remoteFamily!
        };
        console.log(`New ${ socket instanceof TLSSocket ? "secure" : secure ? "secured" : "unsecured" } connection`, address);

        try {
            await this.intercept(socket, secure);
            console.log("Connection closed cleanly", address);
        } catch (err) {
            console.warn("Connection closed with error", address, err);
        }
    }

    protected async intercept(socket: Socket | TLSSocket, secure: boolean) {
        let connection: SmtpInterceptor | undefined;
        try {
            connection = new SmtpInterceptor(socket, secure, this.options, this.onUserAuth, ...(secure ? [] : [this.startTlsServerCertificate]));
            this.connections.add(connection);

            await connection.loop();
        } finally {
            if (connection) {
                this.connections.delete(connection);
                if (this.connections.size === 0) {
                    this.connectionsEmpty?.set();
                }
            }
        }
    }
}

export function createServer(options: SmtpInterceptorOptions, onUserAuth: UserAuthorization, smtpConfig?: TcpServerOptions, smtpTlsConfig?: TcpSecureServerOptions, smtpStartTlsConfig?: TcpSecureServerOptions): SmtpServer {
    return new SmtpServer(options, onUserAuth, smtpConfig, smtpTlsConfig, smtpStartTlsConfig);
}
