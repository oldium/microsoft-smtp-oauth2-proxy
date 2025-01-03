import { SmtpParser } from "../protocol/smtp_parser";
import { TypedEmitter } from "tiny-typed-emitter";
import { Socket } from "node:net";
import { TcpClientConnection } from "../connection/tcp_client_connection";
import { SmtpError } from "../lib/errors";
import { TlsOptions } from "tls";

interface SmtpClientApiEvents {
    "close": () => void;
    "error": (err: Error) => void;
    "end": () => void;
}

export class SmtpClientApi extends TypedEmitter<SmtpClientApiEvents> {
    private readonly client: TcpClientConnection;
    private readonly parser: SmtpParser;

    constructor(clientSocket: Socket, secured: boolean, maxLineLength: number) {
        super();

        this.client = new TcpClientConnection(clientSocket, secured);
        this.parser = new SmtpParser(maxLineLength, this.client.read.bind(this.client));

        this.client.once("close", this.handleClose.bind(this));
        this.client.once("error", this.handleError.bind(this));
        this.client.once("end", this.handleEnd.bind(this));
    }

    public get secured(): boolean {
        return this.client.secured;
    }

    private handleClose() {
        process.nextTick(() => this.emit("close"));
    }

    private handleError(err: Error) {
        process.nextTick(() => this.emit("error", err));
    }

    private handleEnd() {
        process.nextTick(() => this.emit("end"));
    }

    public async close(err?: unknown) {
        await this.client.close(err);
    }

    public async upgradeToTls(options?: TlsOptions) {
        this.client.unshift(this.parser.discard());
        await this.client.upgradeToTls(options);
    }

    public write(data: Buffer | string): void {
        this.client.write(data);
    }

    public isEnded(): boolean {
        return this.client.isEnded();
    }

    public end(): void {
        this.client.end();
    }

    public async readLine(mandatory: false): Promise<{ line: string | null, error?: undefined } | {
        line?: undefined,
        error: SmtpError
    }>;
    // noinspection JSUnusedGlobalSymbols
    public async readLine(mandatory: true): Promise<{ line: string, error?: undefined } | {
        line?: undefined,
        error: SmtpError
    }>;
    // noinspection JSUnusedGlobalSymbols
    public async readLine(mandatory: boolean): Promise<{ line: string | null, error?: undefined } | {
        line?: undefined,
        error: SmtpError
    }>;
    public async readLine(): Promise<{ line: string, error?: undefined } | { line?: undefined, error: SmtpError }>;
    // noinspection JSUnusedGlobalSymbols
    public async readLine(mandatory: boolean | undefined): Promise<{ line: string | null, error?: undefined } | {
        line?: undefined,
        error: SmtpError
    }>;
    public async readLine(mandatory?: boolean): Promise<{ line: string | null, error?: undefined } | {
        line?: undefined,
        error: SmtpError
    }> {
        return await this.parser.readLine(mandatory);
    }

    public async readDataBlock(): Promise<{ data: Buffer, last: boolean }> {
        return await this.parser.readDataBlock();
    }

    public async readChunkBlock(args: string | undefined): Promise<{
        data: Buffer,
        finished: boolean,
        error?: undefined
    } | { data?: undefined, finished?: undefined, error: SmtpError }> {
        return await this.parser.readChunkBlock(args);
    }
}
