import { SmtpError } from "../lib/errors";

export interface Command {
    name: string;
    args: string;
    line: string;
}

export interface Response {
    code: string;
    data: string[];
}

export interface SmtpInterceptorApi {
    get isClientSecured(): boolean;

    get isServerSecured(): boolean;

    on(event: "idle", listener: () => void): this;
    once(event: "idle", listener: () => void): this;
    emit(event: "idle"): boolean;
    off(event: "idle", listener: () => void): this;

    addPipelineResponse(response: string): void;

    pipelineWaitEmpty(): Promise<void>;

    end(): Promise<void>;

    clientReadLine(): Promise<{ line: string; error?: undefined } | {
        line?: undefined;
        error: SmtpError
    }>;

    clientReadChunkBlock(args: string | undefined): Promise<{
        data: Buffer;
        finished: boolean;
        error?: undefined
    } | { data?: undefined; finished?: undefined; error: SmtpError }>;

    clientReadDataBlock(): Promise<{ data: Buffer; last: boolean }>;

    clientWrite(data: Buffer | string): void;

    clientUpgradeToTls(): Promise<void>;

    serverWrite(data: Buffer | string): void;

    serverUpgradeToTls(): Promise<void>;

    forwardRequest(line: string): Promise<Response>;

    enqueueForwardRequest(line: string): void;

    waitForResponse(handler?: (response: Response) => unknown): Promise<Response>;

    forwardResponse(): Promise<Response>;

    enqueueForwardResponse(): void;
}
