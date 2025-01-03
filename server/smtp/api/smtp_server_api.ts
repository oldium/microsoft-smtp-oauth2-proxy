import { TcpServerConnection } from "../connection/tcp_server_connection";
import { SmtpParser } from "../protocol/smtp_parser";
import { TypedEmitter } from "tiny-typed-emitter";

interface SmtpServerApiEvents {
    "close": () => void;
    "error": (err: Error) => void;
}

export class SmtpServerApi extends TypedEmitter<SmtpServerApiEvents> {
    private readonly server: TcpServerConnection;
    private readonly parser: SmtpParser;

    constructor(host: string, port: number, secure: boolean, secured: boolean, maxLineLength: number) {
        super();

        this.server = new TcpServerConnection(host, port, secure, secured);
        this.parser = new SmtpParser(maxLineLength, this.server.read.bind(this.server));

        this.server.once("close", this.handleClose.bind(this));
        this.server.once("error", this.handleError.bind(this));
    }

    public get secured(): boolean {
        return this.server.secured;
    }

    private handleClose() {
        process.nextTick(() => this.emit("close"));
    }

    private handleError(err: Error) {
        process.nextTick(() => this.emit("error", err));
    }

    public async connect() {
        await this.server.connect();
    }

    public async close(err?: unknown) {
        await this.server.close(err);
    }

    public async upgradeToTls() {
        this.server.unshift(this.parser.discard());
        await this.server.upgradeToTls();
    }

    public write(data: Buffer | string): void {
        this.server.write(data);
    }

    public end(): void {
        this.server.end();
    }

    public async read(): Promise<{code: string, data: string[]}> {
        return await this.parser.readRawResponse();
    }
}
