import {
    Addresses,
    Certificate,
    SmtpInterceptorOptions,
    TcpSecureServerOptions,
    TcpServerOptions
} from "../lib/config";
import { Server as TLSServer, TLSSocket } from "tls";
import { Server, Socket } from "net";
import { SmtpClientSecureState, SmtpInterceptor, UserAuthorization } from "./protocol/smtp_interceptor";
import { AddressInfo } from "node:net";
import { Waitable } from "./lib/waitable";
import { tryCloseSocket } from "./lib/socket";
import { sleep } from "../lib/sleep";
import { ConnectionClosedException } from "./lib/exceptions";

const FIRST_VISIBLE_ASCII = 0x20;

export enum SmtpDetectedProtocol {
    Secured,
    Unsecure,
    Tls,
    AutoUnsecure,
    AutoImplicitTls,
}

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
    private readonly smtpAutoTlsServers?: Server[];
    private readonly _smtpAutoTlsLocalAddresses?: (AddressInfo | undefined)[];
    private readonly _smtpAutoTlsAddresses?: (string | undefined)[];
    private readonly _smtpAutoTlsPorts?: (number | undefined)[];
    private readonly autoTlsServerCertificate?: Certificate;
    private readonly connections: Set<SmtpInterceptor> = new Set<SmtpInterceptor>();
    private connectionsEmpty: Waitable | null = null;
    private isListening: boolean = false;
    private readonly pendingConnections: { socket: Socket, protocol: Promise<SmtpDetectedProtocol | null> }[] = [];

    constructor(options: SmtpInterceptorOptions, onUserAuth: UserAuthorization, smtpConfig?: TcpServerOptions, smtpTlsConfig?: TcpSecureServerOptions, smtpStartTlsConfig?: TcpSecureServerOptions, smtpAutoTlsConfig?: TcpSecureServerOptions) {
        this.onUserAuth = onUserAuth;
        this.options = options;

        if (smtpConfig) {
            this.smtpServers = [];
            this._smtpLocalAddresses = [];
            this._smtpAddresses = [];
            this._smtpPorts = [];
            SmtpServer.createServers(smtpConfig.addresses, smtpConfig.ports, () => new Server(), this.smtpServers, this._smtpLocalAddresses, this._smtpAddresses, this._smtpPorts);
        }

        if (smtpTlsConfig) {
            this.smtpTlsServers = [];
            this._smtpTlsLocalAddresses = [];
            this._smtpTlsAddresses = [];
            this._smtpTlsPorts = [];
            SmtpServer.createServers(smtpTlsConfig.addresses, smtpTlsConfig.ports, () => new TLSServer(smtpTlsConfig), this.smtpTlsServers, this._smtpTlsLocalAddresses, this._smtpTlsAddresses, this._smtpTlsPorts);
        }

        if (smtpStartTlsConfig) {
            this.smtpStartTlsServers = [];
            this._smtpStartTlsLocalAddresses = [];
            this._smtpStartTlsAddresses = [];
            this._smtpStartTlsPorts = [];
            this.startTlsServerCertificate = smtpStartTlsConfig;
            SmtpServer.createServers(smtpStartTlsConfig.addresses, smtpStartTlsConfig.ports, () => new Server(), this.smtpStartTlsServers, this._smtpStartTlsLocalAddresses, this._smtpStartTlsAddresses, this._smtpStartTlsPorts);
        }

        if (smtpAutoTlsConfig) {
            this.smtpAutoTlsServers = [];
            this._smtpAutoTlsLocalAddresses = [];
            this._smtpAutoTlsAddresses = [];
            this._smtpAutoTlsPorts = [];
            this.autoTlsServerCertificate = smtpAutoTlsConfig;
            SmtpServer.createServers(smtpAutoTlsConfig.addresses, smtpAutoTlsConfig.ports, () => new Server(), this.smtpAutoTlsServers, this._smtpAutoTlsLocalAddresses, this._smtpAutoTlsAddresses, this._smtpAutoTlsPorts);
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

    public get smtpAutoTlsLocalAddresses(): (AddressInfo | undefined)[] | undefined {
        return this._smtpAutoTlsLocalAddresses;
    }

    // noinspection JSUnusedGlobalSymbols
    public get smtpAutoTlsAddresses(): (string | undefined)[] | undefined {
        return this._smtpAutoTlsAddresses;
    }

    public get smtpAutoTlsPorts(): (number | undefined)[] | undefined {
        return this._smtpAutoTlsPorts;
    }

    private static createServers(addresses: Addresses, ports: number[] | undefined, serverFactory: () => Server, servers: Server[], serverLocalAddresses: (AddressInfo | undefined)[], serverAddresses: (string | undefined)[], serverPorts: (number | undefined)[]) {
        addresses.forEach((address) => {
            // Undefined ports means listen on random port (used by tests)
            const listenPorts = ports ? ports : [undefined];
            listenPorts.forEach((port) => {
                servers.push(serverFactory());
                serverLocalAddresses.push(undefined);
                serverAddresses.push(address ? address : undefined);
                serverPorts.push(port);
            });
        })
    }

    public async listen(): Promise<void> {
        const promises: Promise<void>[] = [];
        if (this.smtpServers) {
            this.allServersListen(this.smtpServers, promises, this._smtpLocalAddresses!, this._smtpAddresses!, this._smtpPorts!);
        }
        if (this.smtpTlsServers) {
            this.allServersListen(this.smtpTlsServers, promises, this._smtpTlsLocalAddresses!, this._smtpTlsAddresses!, this._smtpTlsPorts!);
        }
        if (this.smtpStartTlsServers) {
            this.allServersListen(this.smtpStartTlsServers, promises, this._smtpStartTlsLocalAddresses!, this._smtpStartTlsAddresses!, this._smtpStartTlsPorts!);
        }
        if (this.smtpAutoTlsServers) {
            this.allServersListen(this.smtpAutoTlsServers, promises, this._smtpAutoTlsLocalAddresses!, this._smtpAutoTlsAddresses!, this._smtpAutoTlsPorts!);
        }

        if (promises.length === 0) {
            throw new Error("No SMTP server ports specified to listen on");
        }

        // Notify when both servers either start listening or fail
        try {
            this.smtpServers?.forEach(server => server.on("connection", (socket) => this.onConnectionDetectProtocol(socket, SmtpDetectedProtocol.Secured)));
            this.smtpTlsServers?.forEach(server => server.on("secureConnection", (socket) => this.onConnectionDetectProtocol(socket, SmtpDetectedProtocol.Tls)));
            this.smtpStartTlsServers?.forEach(server => server.on("connection", (socket) => this.onConnectionDetectProtocol(socket, SmtpDetectedProtocol.Unsecure)));
            this.smtpAutoTlsServers?.forEach(server => server.on("connection", (socket) => this.onConnectionDetectProtocol(socket, undefined)));

            await Promise.all(promises);

            this.isListening = true;

            this.processPendingConnections();
        } finally {
            await Promise.allSettled(promises);
        }
    }

    private allServersListen(servers: Server[], promises: Promise<void>[], localAddresses: (AddressInfo | undefined)[], addresses: (string | undefined)[], ports: (number | undefined)[]) {
        servers.forEach((server, index) => {
            promises.push(this.serverListen(server, ports[index] ?? 0, addresses[index]));
            server.once("listening", () => {
                const address = server.address() as AddressInfo;
                localAddresses[index] = address;
                addresses[index] = address.address;
                ports[index] = address.port;
            });
        });
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
        this.smtpAutoTlsServers?.forEach(server => promises.push(this.closeServer(server)));

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
            const { socket, protocol } = this.pendingConnections.shift()!;
            // noinspection JSIgnoredPromiseFromCall
            this.onConnection(socket, protocol);
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

    protected async detectProtocol(socket: Socket, protocol?: SmtpDetectedProtocol | undefined): Promise<SmtpDetectedProtocol> {
        if (protocol !== undefined) {
            return protocol;
        }

        const timeoutPromise = sleep(this.options.protocolInspectionDelayMs);
        const { promise: detectionPromise, resolve: resolveDetection, reject: rejectDetection } = Promise.withResolvers<SmtpDetectedProtocol>();

        const onReadable = () => {
            const beginning: Buffer | null = socket.read(1);
            if (beginning === null) {
                rejectDetection(new ConnectionClosedException("Unexpected connection close during protocol detection"));
                return;
            }
            socket.unshift(beginning);
            if (beginning.at(0)! < FIRST_VISIBLE_ASCII) {
                // Probably binary protocol, we expect SSL/TLS
                resolveDetection(SmtpDetectedProtocol.AutoImplicitTls);
            } else {
                // Probably ASCII character, we expect SMTP
                resolveDetection(SmtpDetectedProtocol.AutoUnsecure);
            }
        };

        const onError = (err: Error) => {
            rejectDetection(err);
        }
        const onClose = () => {
            rejectDetection(new ConnectionClosedException("Unexpected connection close during protocol detection"));
        }

        socket.once("readable", onReadable);
        socket.once("error", onError);
        socket.once("close", onClose);

        try {
            const detectedProtocol = await Promise.race([detectionPromise, timeoutPromise]);

            if (detectedProtocol === undefined) {
                // Timeout - no data read, so we are standard SMTP
                return SmtpDetectedProtocol.AutoUnsecure;
            } else {
                // Data from client arrived, we can determine the protocol
                return detectedProtocol;
            }
        } catch (err) {
            throw err;
        } finally {
            timeoutPromise.cancel();

            socket.off("readable", onReadable);
            socket.off("error", onError);
            socket.off("close", onClose);
        }
    }

    protected async onConnectionDetectProtocol(socket: Socket | TLSSocket, protocol: SmtpDetectedProtocol | undefined) {
        const protocolPromise: Promise<SmtpDetectedProtocol | null> = this.detectProtocol(socket, protocol);

        if (!this.isListening) {
            this.pendingConnections.push({ socket, protocol: protocolPromise });
            return;
        }

        await this.onConnection(socket, protocolPromise);
    }

    protected async formatConnectionType(protocol: Promise<SmtpDetectedProtocol | null> | SmtpDetectedProtocol | null | undefined) {
        let value: SmtpDetectedProtocol | null | undefined = undefined;
        try {
            value = await Promise.any([protocol, undefined]);
        } catch {
            // Nothing to do
        }

        switch (value) {
            case undefined: return "auto-TLS";
            case null: return "auto-TLS";
            case SmtpDetectedProtocol.Unsecure: return "unsecure";
            case SmtpDetectedProtocol.Secured: return "frontend-secured";
            case SmtpDetectedProtocol.Tls: return "TLS";
            case SmtpDetectedProtocol.AutoUnsecure: return "unsecure";
            case SmtpDetectedProtocol.AutoImplicitTls: return "TLS";
        }
    }

    protected async onConnection(socket: Socket | TLSSocket, protocolPromise: Promise<SmtpDetectedProtocol | null>) {
        const address: AddressInfo = {
            address: socket.remoteAddress!,
            port: socket.remotePort!,
            family: socket.remoteFamily!
        };

        const initialProtocol = await Promise.any([protocolPromise, undefined]);
        const initialConnectionType = await this.formatConnectionType(initialProtocol);
        console.log(`New ${ initialConnectionType } connection`, address);
        try {
            const protocol = await protocolPromise;
            if (protocol !== null) {
                const connectionType = await this.formatConnectionType(protocol);
                if (initialConnectionType !== connectionType) {
                    console.info(`Connection detected to be ${ connectionType }`, address);
                }
                await this.intercept(socket, protocol);
            }
            console.log("Connection closed cleanly", address);
        } catch (err) {
            console.warn("Connection closed with error", address, err);
        }
    }

    protected static isAutoTls(protocol: SmtpDetectedProtocol): boolean {
        return (protocol === SmtpDetectedProtocol.AutoImplicitTls
            || protocol === SmtpDetectedProtocol.AutoUnsecure);
    }

    protected async intercept(socket: Socket | TLSSocket, protocol: SmtpDetectedProtocol) {
        let connection: SmtpInterceptor | undefined;
        try {
            const certificates =
                SmtpServer.isAutoTls(protocol)
                    ? [this.autoTlsServerCertificate]
                    : protocol == SmtpDetectedProtocol.Unsecure
                        ? [this.startTlsServerCertificate]
                        : [];
            const secure =
                protocol === SmtpDetectedProtocol.AutoImplicitTls
                    ? SmtpClientSecureState.ImplicitTls
                    : (protocol === SmtpDetectedProtocol.Secured || protocol == SmtpDetectedProtocol.Tls)
                        ? SmtpClientSecureState.Secured
                        : SmtpClientSecureState.Unsecure;
            connection = new SmtpInterceptor(socket, secure, this.options, this.onUserAuth, ...certificates);
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

export function createServer(options: SmtpInterceptorOptions, onUserAuth: UserAuthorization, smtpConfig?: TcpServerOptions, smtpTlsConfig?: TcpSecureServerOptions, smtpStartTlsConfig?: TcpSecureServerOptions, smtpAutoTlsConfig?: TcpSecureServerOptions): SmtpServer {
    return new SmtpServer(options, onUserAuth, smtpConfig, smtpTlsConfig, smtpStartTlsConfig, smtpAutoTlsConfig);
}
