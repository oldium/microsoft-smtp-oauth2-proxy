import { type Response } from './smtp_parser';
import { Socket } from 'node:net';
import assert from "node:assert";
import { ConnectionClosedException, TimeoutException } from "../lib/exceptions";
import { Certificate, SmtpInterceptorOptions } from "../../lib/config";
import { TypedEmitter } from "tiny-typed-emitter";
import { SmtpServerApi } from "../api/smtp_server_api";
import { Pipeline } from "../lib/pipeline";
import { Waitable } from "../lib/waitable";
import { UserToken } from "../../lib/microsoft";
import { SmtpClientApi } from "../api/smtp_client_api";
import { SmtpInterceptorApi } from "../api/smtp_interceptor_api";
import { SmtpError } from "../lib/errors";
import { SmtpProtocol } from "./smtp_protocol";

export type UserAuthorization = (username: string, password: string) => Promise<UserToken | null> | UserToken | null;

interface SmtpInterceptorEvents {
    "idle": () => void;
}

export class SmtpInterceptor extends TypedEmitter<SmtpInterceptorEvents> implements SmtpInterceptorApi {
    private readonly clientApi: SmtpClientApi;
    private readonly serverApi: SmtpServerApi;
    private readonly pipeline: Pipeline;
    private readonly protocol: SmtpProtocol;
    private readonly starttlsCertificates?: Certificate;

    private readonly onUserAuth: UserAuthorization;

    private readonly closed = new Waitable(null);

    constructor(clientSocket: Socket, clientSecured: boolean, options: SmtpInterceptorOptions, onUserAuth: UserAuthorization, starttlsCertificates?: Certificate) {
        super();

        this.starttlsCertificates = starttlsCertificates;
        assert(clientSecured || (this.starttlsCertificates?.key && this.starttlsCertificates?.cert), "for insecure clients the STARTTLS certificates must be provided");

        this.serverApi = new SmtpServerApi(options.target.host, options.target.port, !!options.target.secure, !!options.target.secured, options.maxLineLength);
        this.serverApi
            .once("close", this.handleServerClose.bind(this))
            .once("error", this.handleServerError.bind(this));

        this.clientApi = new SmtpClientApi(clientSocket, clientSecured, options.maxLineLength);
        this.clientApi
            .once("close", this.handleClientClose.bind(this))
            .once("error", this.handleClientError.bind(this))
            .once("end", this.handleClientEnd.bind(this));

        this.pipeline = new Pipeline();
        this.pipeline.on("empty", () => this.emit("idle"));

        this.protocol = new SmtpProtocol(this, options.greetingName, options.timeouts, this.checkUser.bind(this));
        this.protocol
            .once("timeout", this.handleClientTimeout.bind(this));

        this.onUserAuth = onUserAuth;
    }

    public get isClientSecured(): boolean {
        return this.clientApi.secured;
    }

    public get isServerSecured(): boolean {
        return this.serverApi.secured;
    }

    public async loop() {
        const loops: Promise<void>[] = [];
        try {
            await this.serverApi.connect();

            const clientLoop = this.clientLoop();
            loops.push(clientLoop);

            loops.push(this.pipeline.loop());

            await clientLoop;
            await this.pipeline.waitEmpty();
            await this.close();
        } catch (err) {
            await this.close(err);
            throw err;
        } finally {
            await Promise.allSettled(loops);
        }

        // Forward any originally stored exception
        await this.closed.promise;
    }

    private async clientLoop() {
        const value = await Promise.race([this.protocol.initialHandshake(), this.closed.promise]);
        if (value === null) {
            throw new ConnectionClosedException("Unexpected connection close before initial handshake");
        }

        while (!this.clientApi.isEnded()) {
            const { line, error } = await this.clientApi.readLine(false);
            if (error) {
                this.addPipelineResponse(error.code + " " + error.message + "\r\n");
            } else {
                if (line === null) {
                    await this.handleClientEnd();
                    break;
                }
                await this.protocol.clientRequest(line);
            }
        }
    }

    public async waitForResponse(handler?: (response: Response) => unknown) {
        const responsePromise = new Promise<{ code: string, data: string[] }>((resolve, reject) => {
            const forwardServerResponse = async () => {
                try {
                    const response = await this.serverApi.read();
                    await handler?.call(null, response);
                    resolve(response);
                } catch (err) {
                    reject(err);
                }
            };
            this.pipeline.add(forwardServerResponse);
        });

        const response = await Promise.race([responsePromise, this.closed.promise]);
        if (response === null) {
            throw new ConnectionClosedException("Unexpected connection close while waiting for server response");
        } else {
            return response;
        }
    }

    private async close(err?: unknown): Promise<void> {
        if (!this.closed.done) {
            this.closed.set(err);

            await this.serverApi.close(err);
            await this.clientApi.close(err);
            await this.pipeline.close(err);
            this.protocol.close();
        }
    }

    public addPipelineResponse(response: string) {
        this.pipeline.add(() => { this.clientWrite(response); });
    }

    public async pipelineWaitEmpty() {
        await this.pipeline.waitEmpty();
    }

    public async end(): Promise<void> {
        this.serverApi.end();
        await this.pipelineClose();
        this.clientApi.end();
    }

    public clientWrite(data: Buffer | string) {
        this.clientApi.write(data);
    }

    public async clientReadLine(): Promise<{ line: string; error?: undefined } | {
        line?: undefined;
        error: SmtpError
    }> {
        return await this.clientApi.readLine();
    }

    public async clientReadChunkBlock(args: string | undefined): Promise<{
        data: Buffer;
        finished: boolean;
        error?: undefined
    } | { data?: undefined; finished?: undefined; error: SmtpError }> {
        return await this.clientApi.readChunkBlock(args);
    }

    public async clientReadDataBlock(): Promise<{ data: Buffer; last: boolean }> {
        return await this.clientApi.readDataBlock();
    }

    public async clientUpgradeToTls() {
        await this.clientApi.upgradeToTls(this.starttlsCertificates);
    }

    public serverWrite(data: Buffer | string) {
        this.serverApi.write(data);
    }

    public async serverUpgradeToTls() {
        await this.serverApi.upgradeToTls();
    }

    private async pipelineClose() {
        await this.pipeline.close();
    }

    private async handleServerClose() {
        await this.close();
    }

    private async handleServerError(err: Error) {
        await this.close(err);
    }

    private async handleClientClose() {
        await this.close();
    }

    private async handleClientError(err: Error) {
        await this.close(err);
    }

    private async handleClientEnd() {
        // Finish closing the connection, do not use half-open state
        await this.clientApi.close();
    }

    private async handleClientTimeout() {
        await this.close(new TimeoutException("Timeout"));
    }

    public enqueueForwardRequest(line: string) {
        // Supply the catch function to prevent unhandled promise rejection
        this.forwardRequest(line).catch(() => {});
    }

    public async forwardRequest(line: string): Promise<{ code: string, data: string[] }> {
        this.serverWrite(line + '\r\n');
        return await this.forwardResponse();
    }

    public enqueueForwardResponse() {
        // Supply the catch function to prevent unhandled promise rejection
        this.forwardResponse().catch(() => {});
    }

    public async forwardResponse(): Promise<{ code: string, data: string[] }> {
        return await this.waitForResponse((response) => {
            const { data } = response;
            this.clientApi.write(data.join(""));
        });
    }

    public async checkUser(username: string, password: string): Promise<UserToken | null> {
        try {
            const result = await this.onUserAuth(username, password);
            if (result) {
                console.info(`User ${result.username} with email ${ username } authenticated`);
                return result;
            }
        } catch {
            // Nothing to do
        }
        console.warn(`User with email ${ username } not authenticated`);
        return null;
    }
}
