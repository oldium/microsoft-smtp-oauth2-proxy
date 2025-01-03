import { ConnectionClosedException, InvalidResponseException } from "../lib/exceptions";
import assert from "node:assert";
import { SmtpError } from "../lib/errors";

export interface Response {
    code: string;
    data: string[];
}

export const CRLF = Buffer.from('\r\n', 'binary');
export const DOT_CRLF = Buffer.from('.\r\n', 'binary');
export const ENDING_DOT_CRLF = Buffer.from('\r\n.\r\n', 'binary');

export class SmtpParser {
    private dataBuffer: Buffer = Buffer.alloc(0);
    private readonly maxLineLength: number;
    private readonly dataProvider: () => Promise<Buffer | null>;
    private mode: 'line' | 'data' | 'chunk' = 'line';
    private beginning: boolean = true;
    private chunkRemainingSize: number = 0;

    constructor(maxLineLength: number, dataProvider: () => Promise<Buffer | null>) {
        this.dataProvider = dataProvider;
        this.maxLineLength = maxLineLength;
    }

    public discard() {
        const result = this.dataBuffer;
        this.dataBuffer = Buffer.alloc(0);
        return result;
    }

    private switchMode(mode: 'line' | 'data' | 'chunk') {
        if (this.mode != mode) {
            this.finishMode();
        }
        this.mode = mode;
    }

    private finishMode() {
        this.beginning = true;
        this.chunkRemainingSize = 0;
    }

    private async moreData(): Promise<true>;
    // noinspection JSUnusedLocalSymbols
    private async moreData(mandatory: true): Promise<true>;
    private async moreData(mandatory: boolean | undefined): Promise<boolean>;
    private async moreData(mandatory?: boolean): Promise<boolean> {
        if (mandatory === undefined) {
            mandatory = true;
        }

        const data = await this.dataProvider();
        if (mandatory && data === null) {
            throw new ConnectionClosedException("Unexpected end of data");
        }

        if (data) {
            this.dataBuffer = Buffer.concat([this.dataBuffer, data]);
        }
        return data !== null;
    }

    // noinspection JSUnusedLocalSymbols
    private async readRawLineUnchecked(mandatory: false): Promise<{data: Buffer | null, error?: undefined} | {data?: undefined, error: SmtpError}>;
    // noinspection JSUnusedLocalSymbols
    private async readRawLineUnchecked(mandatory: true): Promise<{data: Buffer, error?: undefined} | {data?: undefined, error: SmtpError}>;
    private async readRawLineUnchecked(mandatory: boolean): Promise<{data: Buffer | null, error?: undefined} | {data?: undefined, error: SmtpError}>;
    private async readRawLineUnchecked(): Promise<{data: Buffer, error?: undefined} | {data?: undefined, error: SmtpError}>;
    private async readRawLineUnchecked(mandatory?: boolean): Promise<{data: Buffer | null, error?: undefined} | {data?: undefined, error: SmtpError}> {
        if (mandatory === undefined) {
            mandatory = true;
        }

        if (this.dataBuffer.length === 0) {
            if (!await this.moreData(mandatory)) {
                return { data: null };
            }
        }

        let lineOffset = 0;
        let skipping = false;
        while (true) {
            const lineEnd = this.dataBuffer.indexOf(CRLF, lineOffset);
            if (lineEnd === -1) {
                if (this.dataBuffer.length > this.maxLineLength || skipping) {
                    skipping = true;
                    this.dataBuffer = this.dataBuffer.subarray(this.dataBuffer.length - (CRLF.length - 1));
                    lineOffset = 0;
                } else {
                    lineOffset = this.dataBuffer.length - (CRLF.length - 1);
                }
                if (!await this.moreData((this.dataBuffer.length > 0) || mandatory)) {
                    return { data: null };
                }
            } else {
                const lineData = this.dataBuffer.subarray(0, lineEnd + CRLF.length);
                this.dataBuffer = this.dataBuffer.subarray(lineEnd + CRLF.length);
                if ((lineData.length + CRLF.length) > this.maxLineLength || skipping) {
                    return {error: {code: "500", message: "5.5.6 Line too long"}};
                }
                return { data: lineData };
            }
        }
    }

    // noinspection JSUnusedGlobalSymbols
    public async readLine(mandatory: false): Promise<{line: string | null, error?: undefined} | {line?: undefined, error: SmtpError}>;
    // noinspection JSUnusedGlobalSymbols
    public async readLine(mandatory: true): Promise<{line: string, error?: undefined} | {line?: undefined, error: SmtpError}>;
    // noinspection JSUnusedGlobalSymbols
    public async readLine(mandatory: boolean): Promise<{line: string | null, error?: undefined} | {line?: undefined, error: SmtpError}>;
    // noinspection JSUnusedGlobalSymbols
    public async readLine(): Promise<{line: string, error?: undefined} | {line?: undefined, error: SmtpError}>;
    public async readLine(mandatory: boolean | undefined): Promise<{line: string | null, error?: undefined} | {line?: undefined, error: SmtpError}>;
    public async readLine(mandatory?: boolean): Promise<{line: string | null, error?: undefined} | {line?: undefined, error: SmtpError}> {
        this.switchMode('line');

        if (mandatory === undefined) {
            mandatory = true;
        }

        try {
            const { data: line, error } = await this.readRawLineUnchecked(mandatory);

            if (error) {
                return { error };
            } else if (line === null) {
                return { line };
            } else {
                assert(error === undefined, "error must not be defined when data are returned");
                return { line: line.subarray(0, line.length - CRLF.length).toString("binary") };
            }
        } finally {
            this.finishMode();
        }
    }

    public async readRawResponse(): Promise<Response> {
        this.switchMode('line');

        try {
            let { data, error } = await this.readRawLineUnchecked();
            if (error) {
                throw new InvalidResponseException(error.message);
            }
            assert(data !== undefined);
            if (data.length < 3) {
                throw new InvalidResponseException("Response line too short");
            }

            let line = data.toString("binary");
            const rawLines = [line];
            const code = line.substring(0, 3);
            let skipping = false;
            while (line[3] === '-') {
                ({ data, error } = await this.readRawLineUnchecked());
                if (error) {
                    throw new InvalidResponseException(error.message);
                }
                assert(data !== undefined);
                line = data.toString("binary");
                if (line!.length < 3) {
                    throw new InvalidResponseException("Response line too short");
                }
                const lineCode = line.substring(0, 3);
                if (lineCode !== code) {
                    skipping = true;
                }
                if (!skipping) {
                    rawLines.push(line);
                }
            }

            if (skipping) {
                throw new InvalidResponseException("Response code not consistent");
            }
            return { code, data: rawLines };
        } finally {
            this.finishMode();
        }
    }

    public async readDataBlock(): Promise<{data: Buffer, last: boolean}> {
        this.switchMode('data');

        try {
            if (this.beginning) {
                while (this.dataBuffer.length < DOT_CRLF.length) {
                    await this.moreData();
                }
                if (this.dataBuffer.compare(DOT_CRLF, 0, DOT_CRLF.length, 0, DOT_CRLF.length) === 0) {
                    const data = this.dataBuffer.subarray(0, DOT_CRLF.length);
                    this.dataBuffer = this.dataBuffer.subarray(DOT_CRLF.length);
                    this.finishMode();
                    return { data, last: true };
                }
                this.beginning = false;
            }

            while (this.dataBuffer.length < ENDING_DOT_CRLF.length) {
                await this.moreData();
            }

            const dataEnd = this.dataBuffer.indexOf(ENDING_DOT_CRLF);
            if (dataEnd === -1) {
                const data = this.dataBuffer.subarray(0, this.dataBuffer.length - (ENDING_DOT_CRLF.length - 1));
                this.dataBuffer = this.dataBuffer.subarray(this.dataBuffer.length - (ENDING_DOT_CRLF.length - 1));
                return { data, last: false };
            } else {
                const data = this.dataBuffer.subarray(0, dataEnd + ENDING_DOT_CRLF.length);
                this.dataBuffer = this.dataBuffer.subarray(dataEnd + ENDING_DOT_CRLF.length);
                this.finishMode();
                return { data, last: true };
            }
        } catch (err) {
            this.finishMode();
            throw err;
        }
    }

    public async readChunkBlock(args: string | undefined): Promise<{data: Buffer, finished: boolean, error?: undefined} | {data?: undefined, finished?: undefined, error: SmtpError}> {
        this.switchMode('chunk');

        try {
            if (this.beginning === true) {
                assert(args !== undefined);

                const parts = args.split(' ');

                if (parts.length < 1) {
                    this.finishMode();
                    return { error: { code: "501", message: "5.5.2 Invalid chunk format" } };
                }

                const dataLength = parseInt(parts[0]);
                if (dataLength < 0 || isNaN(dataLength)) {
                    this.finishMode();
                    return { error: { code: "501", message: "5.5.2 Invalid chunk data size" } };
                }

                this.chunkRemainingSize = dataLength;
                this.beginning = false;
            }

            if (this.dataBuffer.length == 0 && this.chunkRemainingSize > 0) {
                await this.moreData();
            }

            if (this.dataBuffer.length >= this.chunkRemainingSize) {
                const chunk = this.dataBuffer.subarray(0, this.chunkRemainingSize);
                this.dataBuffer = this.dataBuffer.subarray(this.chunkRemainingSize);
                this.chunkRemainingSize -= chunk.length;
                this.finishMode();
                return { data: chunk, finished: true };
            } else {
                const chunk = this.dataBuffer;
                this.dataBuffer = Buffer.alloc(0);
                this.chunkRemainingSize -= chunk.length;
                return { data: chunk, finished: false };
            }
        } catch (err) {
            this.finishMode();
            throw err;
        }
    }
}
