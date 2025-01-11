import { UserToken } from "../../lib/microsoft";
import { Command, Response, SmtpInterceptorApi } from "../api/smtp_interceptor_api";
import { base64Decode, base64Encode } from "../lib/base64";
import { CRLF } from "./smtp_parser";
import { SmtpTimer } from "./smtp_timer";
import { EhloUnsuccessfulException, StartTlsUnsuccessfulException } from "../lib/exceptions";
import { TypedEmitter } from "tiny-typed-emitter";
import { SmtpTimeouts } from "../../lib/config";
import { Waitable } from "../lib/waitable";

type SmtpCommandInterceptor = (command: Command) => Promise<void>;
type SmtpCommand = (command: Command) => Promise<Response>;

interface SmtpProtocolEvents {
    "timeout": () => void,
}

type Stages = "init" | "helo" | "tls" | "auth";
type Commands = { [key: string]: SmtpCommandInterceptor } & { default?: SmtpCommandInterceptor };

const ERR_SYNTAX_ERROR = { code: "501", message: "5.5.2 Syntax error in parameters or arguments" };
const ERR_AUTH_ABORTED = { code: "501", message: "5.5.2 Authentication aborted" };
const ERR_BAD_SEQUENCE = { code: "503", message: "5.5.1 Bad sequence of commands" };
// noinspection SpellCheckingInspection
const ERR_SEND_HELO_EHLO = { code: "503", message: "5.5.1 Send HELO/EHLO first" };
const ERR_CONNECTION_SECURED = { code: "503", message: "5.5.1 Connection already secured" };
const ERR_ISSUE_STARTTLS_FIRST = { code: "530", message: "5.7.0 Must issue a STARTTLS command first" };
const ERR_AUTH_REQUIRED = { code: "530", message: "5.7.0 Authentication required" };
const ERR_AUTH_FAILED = { code: "535", message: "5.7.8 Authentication failed" };

// noinspection SpellCheckingInspection
export class SmtpProtocol extends TypedEmitter<SmtpProtocolEvents> {
    private readonly onCheckUser: (username: string, password: string) => Promise<UserToken | null> | UserToken | null;
    private readonly api: SmtpInterceptorApi;
    private readonly greetingName: string;

    private readonly stageCommands: { [key in Stages]: Commands } = { "init": {}, "helo": {}, "tls": {}, "auth": {} };
    private stage: Stages = "init";

    private readonly timer: SmtpTimer;
    private readonly timeouts: SmtpTimeouts;

    private readonly closed = new Waitable(null);

    constructor(api: SmtpInterceptorApi, greetingName: string, timeouts: SmtpTimeouts, onCheckUser: (username: string, password: string) => Promise<UserToken | null> | UserToken | null) {
        super();

        this.api = api;
        this.greetingName = greetingName;

        this.onCheckUser = onCheckUser;

        this.timer = new SmtpTimer();
        this.timer.once("timeout", () => this.emit("timeout"));
        this.timeouts = timeouts;

        const QUIT = this.smtpQuit.bind(this);

        this.stageCommands.init["HELO"] = this.initialHelo(this.smtpHeloRequest.bind(this));
        this.stageCommands.init["EHLO"] = this.initialHelo(this.smtpEhloRequest.bind(this));
        this.stageCommands.init["BDAT"] = this.smtpBdatDiscardWithError.bind(this, ERR_SEND_HELO_EHLO.code, ERR_SEND_HELO_EHLO.message);
        this.stageCommands.init["QUIT"] = QUIT;
        this.stageCommands.init.default = this.initialCommands.bind(this);

        const HELO = this.withResponse(this.smtpHeloRequest.bind(this));
        const EHLO = this.withResponse(this.smtpEhloRequest.bind(this));

        this.stageCommands.helo["HELO"] = HELO;
        this.stageCommands.helo["EHLO"] = EHLO;
        this.stageCommands.helo["QUIT"] = QUIT;
        this.stageCommands.helo["BDAT"] = this.smtpBdatDiscardWithError.bind(this, ERR_ISSUE_STARTTLS_FIRST.code, ERR_ISSUE_STARTTLS_FIRST.message);
        this.stageCommands.helo["STARTTLS"] = this.smtpStartTls.bind(this);
        this.stageCommands.helo.default = this.heloCommands.bind(this);

        this.stageCommands.tls["HELO"] = HELO;
        this.stageCommands.tls["EHLO"] = EHLO;
        this.stageCommands.tls["QUIT"] = QUIT;
        this.stageCommands.tls["AUTH"] = this.smtpAuth.bind(this);
        this.stageCommands.tls["BDAT"] = this.smtpBdatDiscardWithError.bind(this, ERR_AUTH_REQUIRED.code, ERR_AUTH_REQUIRED.message);
        this.stageCommands.tls.default = this.tlsCommands.bind(this);

        this.stageCommands.auth["HELO"] = HELO;
        this.stageCommands.auth["EHLO"] = EHLO;
        this.stageCommands.auth["QUIT"] = QUIT;
        this.stageCommands.auth["DATA"] = this.smtpData.bind(this);
        this.stageCommands.auth["BDAT"] = this.smtpBdat.bind(this);
        this.stageCommands.auth.default = this.authCommands.bind(this);
    }

    public async clientRequest(line: string) {
        const spaceIndex = line.indexOf(' ');
        const name = (spaceIndex === -1 ? line : line.substring(0, spaceIndex)).toUpperCase();
        const args = spaceIndex === -1 ? '' : line.substring(spaceIndex + 1);

        const command: Command = { name, args, line };
        this.timer.stop();

        const interceptor = this.stageCommands[this.stage][command.name] ?? this.stageCommands[this.stage].default;
        await interceptor(command);
    }

    private onIdle(): void {
        if (!this.closed.done) {
            this.timer.start(this.timeouts.clientMs);
        }
    }

    public close(err?: unknown) {
        this.timer.close();
        this.closed.set(err);
    }

    public async initialHandshake() {
        const { code: initialCode, data: initialData } = await this.api.waitForResponse();

        // Install idle handler to restart the client activity timer
        this.api.on("idle", this.onIdle.bind(this));

        if (initialCode !== '220') {
            this.api.addPipelineResponse(initialData.join(""));
            return;
        }

        initialData[initialData.length - 1] = initialData[initialData.length - 1].substring(0, 3) + "-" + initialData[initialData.length - 1].substring(4);
        initialData.push(`220 Welcome to microsoft-smtp-oauth2-proxy @ ${ this.greetingName }\r\n`);
        this.api.addPipelineResponse(initialData.join(""));
    }

    public withResponse(smtpCommand: SmtpCommand) {
        return async (command: Command): Promise<void> => {
            const { data } = await smtpCommand(command);
            this.api.clientWrite(data.join(""));
        };
    }

    public initialHelo(smtpCommand: SmtpCommand) {
        return async (command: Command): Promise<void> => {
            const { code, data } = await smtpCommand(command);
            let responseData = data;

            if (code === '250') {
                if (this.api.isClientSecured) {
                    // Upgrade server side if necessary
                    if (!this.api.isServerSecured) {
                        this.api.serverWrite("STARTTLS\r\n");
                        const { code: startTlsCode, data: startTlsData } = await this.api.waitForResponse();
                        if (startTlsCode !== '220') {
                            throw new StartTlsUnsuccessfulException("STARTTLS unsuccessful: " + startTlsData[0].substring(0, startTlsData[0].length - CRLF.length));
                        }
                        await this.api.serverUpgradeToTls();

                        // Repeat HELO/EHLO after STARTTLS
                        const { code: codeAfter, data: dataAfter } = await smtpCommand(command);
                        if (codeAfter !== '250') {
                            throw new EhloUnsuccessfulException("EHLO unsuccessful: " + dataAfter[0].substring(0, dataAfter[0].length - CRLF.length));
                        }
                        responseData = dataAfter;
                    }
                    this.stage = "tls";
                } else {
                    this.stage = "helo";
                }
            }

            this.api.clientWrite(responseData.join(""));
        };
    }

    public async initialCommands(command: Command): Promise<void> {
        if (["NOOP", "RSET"].includes(command.name)) {
            this.api.enqueueForwardRequest(command.line);
        } else {
            this.api.addPipelineResponse(`${ ERR_SEND_HELO_EHLO.code } ${ ERR_SEND_HELO_EHLO.message }\r\n`);
        }
    }

    public async heloCommands(command: Command): Promise<void> {
        // RFC3207: The server SHOULD return the reply code 530 to every command other than NOOP, EHLO, STARTTLS, or
        // QUIT. We permit RSET here as well.
        if (["NOOP", "RSET"].includes(command.name)) {
            this.api.enqueueForwardRequest(command.line);
        } else {
            this.api.addPipelineResponse(`${ ERR_ISSUE_STARTTLS_FIRST.code } ${ ERR_ISSUE_STARTTLS_FIRST.message }\r\n`);
        }
    }

    public async tlsCommands(command: Command): Promise<void> {
        if (["NOOP", "RSET"].includes(command.name)) {
            this.api.enqueueForwardRequest(command.line);
        } else if (command.name === "STARTTLS") {
            this.api.addPipelineResponse(`${ ERR_CONNECTION_SECURED.code } ${ ERR_CONNECTION_SECURED.message }\r\n`);
        } else {
            this.api.addPipelineResponse(`${ ERR_AUTH_REQUIRED.code } ${ ERR_AUTH_REQUIRED.message }\r\n`);
        }
    }

    public async authCommands(command: Command): Promise<void> {
        if (command.name === "AUTH") {
            this.api.addPipelineResponse(`${ ERR_BAD_SEQUENCE.code } ${ ERR_BAD_SEQUENCE.message }\r\n`);
        } else if (command.name === "STARTTLS") {
            this.api.addPipelineResponse(`${ ERR_CONNECTION_SECURED.code } ${ ERR_CONNECTION_SECURED.message }\r\n`);
        } else {
            this.api.enqueueForwardRequest(command.line);
        }
    }

    // noinspection SpellCheckingInspection
    public async smtpHeloRequest(command: Command): Promise<Response> {
        this.api.serverWrite(command.line + "\r\n");
        return await this.api.waitForResponse();
    }

    public async smtpEhloRequest(command: Command): Promise<Response> {
        this.api.serverWrite(command.line + "\r\n");
        const { code, data } = await this.api.waitForResponse();
        if (code === '250') {
            const authIndex = data.findIndex((value) => value.substring(4, 9).toUpperCase() === "AUTH ");
            if (authIndex !== -1) {
                const authLine = data[authIndex];
                data[authIndex] = authLine.substring(0, 9) + "PLAIN LOGIN\r\n";
            }
            if (!this.api.isClientSecured) {
                const startTlsIndex = data.findIndex((value) => value.substring(4).toUpperCase() === "STARTTLS\r\n");
                if (startTlsIndex === -1) {
                    data[data.length - 1] = data[data.length - 1].substring(0, 3) + "-" + data[data.length - 1].substring(4);
                    data.push("250 STARTTLS\r\n");
                }
            }
        }
        return { code, data };
    }

    public async smtpAuth(command: Command): Promise<void> {
        const space = command.args.indexOf(' ');
        const authType = space === -1 ? command.args : command.args.substring(0, space);
        const authArgs = space === -1 ? '' : command.args.substring(space + 1);

        if (authType === 'PLAIN') {
            await this.smtpAuthPlain(authArgs);
        } else if (authType === 'LOGIN') {
            await this.smtpAuthLogin(authArgs);
        } else {
            this.api.addPipelineResponse('504 5.5.4 Unknown authentication mechanism\r\n');
        }
    }

    private async smtpAuthClientReadLine() {
        const { line, error } = await this.api.clientReadLine();
        if (error) {
            if (error.code === "500") {
                error.message = "5.5.6 Authentication Exchange line is too long";
            }
            return { error };
        } else {
            return { line };
        }
    }

    private async smtpAuthPlain(authArgs: string) {
        if (authArgs === "") {
            this.api.addPipelineResponse("334 \r\n");
            const { line, error } = await this.smtpAuthClientReadLine();
            if (error) {
                this.api.addPipelineResponse(error.code + " " + error.message + "\r\n");
                return;
            }
            if (line === "*") {
                this.api.addPipelineResponse(`${ ERR_AUTH_ABORTED.code } ${ ERR_AUTH_ABORTED.message }\r\n`);
                return;
            }
            authArgs = line;
        }
        if (authArgs === "*" || authArgs === "=") {
            this.api.addPipelineResponse(`${ ERR_SYNTAX_ERROR.code } ${ ERR_SYNTAX_ERROR.message }\r\n`);
            return;
        }
        const credentialsBase64 = authArgs!.trim();
        if (credentialsBase64.length === 0) {
            this.api.addPipelineResponse(`${ ERR_SYNTAX_ERROR.code } ${ ERR_SYNTAX_ERROR.message }\r\n`);
            return;
        }
        let credentials: string;
        try {
            credentials = base64Decode(credentialsBase64);
        } catch {
            this.api.addPipelineResponse(`${ ERR_SYNTAX_ERROR.code } ${ ERR_SYNTAX_ERROR.message }\r\n`);
            return
        }
        const plainParts = credentials.split("\0");
        if (plainParts.length != 3) {
            this.api.addPipelineResponse(`${ ERR_SYNTAX_ERROR.code } ${ ERR_SYNTAX_ERROR.message }\r\n`);
            return;
        }
        const username = plainParts[1];
        const password = plainParts[2];

        const userToken = await this.onCheckUser(username, password);
        if (userToken) {
            await this.doServerSmtpAuth(userToken.username, userToken.accessToken);
        } else {
            this.api.addPipelineResponse(`${ ERR_AUTH_FAILED.code } ${ ERR_AUTH_FAILED.message }\r\n`);
        }
    }

    private async smtpAuthLogin(authArgs: string) {
        if (authArgs === "=" || authArgs === "*") {
            this.api.addPipelineResponse(`${ ERR_SYNTAX_ERROR.code } ${ ERR_SYNTAX_ERROR.message }\r\n`);
            return;
        }

        let username, password;

        {
            this.api.addPipelineResponse("334 VXNlcm5hbWU6\r\n");
            const { line, error } = await this.smtpAuthClientReadLine();
            if (error) {
                this.api.addPipelineResponse(error.code + " " + error.message + "\r\n");
                return;
            }
            if (line === "*") {
                this.api.addPipelineResponse(`${ ERR_AUTH_ABORTED.code } ${ ERR_AUTH_ABORTED.message }\r\n`);
                return;
            }
            try {
                username = base64Decode(line);
            } catch {
                this.api.addPipelineResponse(`${ ERR_SYNTAX_ERROR.code } ${ ERR_SYNTAX_ERROR.message }\r\n`);
                return;
            }
        }

        {
            this.api.addPipelineResponse("334 UGFzc3dvcmQ6\r\n");
            const { line, error } = await this.smtpAuthClientReadLine();
            if (error) {
                this.api.addPipelineResponse(error.code + " " + error.message + "\r\n");
                return;
            }
            if (line === "*") {
                this.api.addPipelineResponse(`${ ERR_AUTH_ABORTED.code } ${ ERR_AUTH_ABORTED.message }\r\n`);
                return;
            }
            try {
                password = base64Decode(line);
            } catch {
                this.api.addPipelineResponse(`${ ERR_SYNTAX_ERROR.code } ${ ERR_SYNTAX_ERROR.message }\r\n`);
                return;
            }
        }

        const userToken = await this.onCheckUser(username, password);
        if (userToken) {
            await this.doServerSmtpAuth(userToken.username, userToken.accessToken);
        } else {
            this.api.addPipelineResponse(`${ ERR_AUTH_FAILED.code } ${ ERR_AUTH_FAILED.message }\r\n`);
        }
    }

    private async doServerSmtpAuth(username: string, accessToken: string) {
        const authToken = [`user=${ username }`, `auth=Bearer ${ accessToken }`, "", ""].join("\x01");
        const authTokenBase64 = base64Encode(authToken, "utf-8");

        this.api.serverWrite("AUTH XOAUTH2 " + authTokenBase64 + "\r\n");
        const { code, data } = await this.api.waitForResponse();
        if (code !== '235') {
            console.error("Authentication error: " + data[0].substring(data[0].length - CRLF.length), data);
            this.api.addPipelineResponse(`${ ERR_AUTH_FAILED.code } ${ ERR_AUTH_FAILED.message }\r\n`);
        } else {
            this.stage = "auth";
            this.api.addPipelineResponse("235 2.7.0 Authentication successful\r\n");
        }
    }

    // noinspection SpellCheckingInspection
    public async smtpBdat(command: Command): Promise<void> {
        let bdatCommand: Command | null = command;
        while (true) {
            const { data, finished, error } = await this.api.clientReadChunkBlock(bdatCommand?.args);
            if (error) {
                this.api.addPipelineResponse(error.code + " " + error.message + "\r\n");
                break;
            } else {
                if (bdatCommand) {
                    this.api.serverWrite(bdatCommand.line + "\r\n");
                    bdatCommand = null;
                }
                this.api.serverWrite(data);

                if (finished) {
                    this.api.enqueueForwardResponse();
                    break;
                }
            }
        }
    }

    // noinspection SpellCheckingInspection
    public async smtpBdatDiscardWithError(code: string, message: string, command: Command): Promise<void> {
        let bdatCommand: Command | null = command;
        while (true) {
            const { finished, error } = await this.api.clientReadChunkBlock(bdatCommand?.args);
            bdatCommand = null;

            if (error) {
                this.api.addPipelineResponse(`${ error.code } ${ error.message }\r\n`);
                break;
            } else {
                if (finished) {
                    this.api.addPipelineResponse(`${ code } ${ message }\r\n`);
                    break;
                }
            }
        }
    }

    public async smtpData(command: Command): Promise<void> {
        const { code } = await this.api.forwardRequest(command.line);
        if (code !== '354') {
            return;
        }

        let last = false;
        while (!last) {
            let data;
            ({ data, last } = await this.api.clientReadDataBlock());
            this.api.serverWrite(data);
            if (last) {
                this.api.enqueueForwardResponse();
            }
        }
    }

    public async smtpQuit(command: Command): Promise<void> {
        this.api.serverWrite(command.line + '\r\n');
        await this.api.waitForResponse((response: Response) => {
            this.api.clientWrite(response.data.join(""));
            this.api.end();
        });
    }

    public async smtpStartTls(command: Command): Promise<void> {
        if (this.api.isServerSecured) {
            this.api.addPipelineResponse('220 2.0.0 Ready to start TLS\r\n');
            await this.api.pipelineWaitEmpty();
            await this.api.clientUpgradeToTls();
            this.stage = "tls";
        } else {
            this.api.serverWrite(command.line + '\r\n');
            const { code } = await this.api.forwardResponse();
            if (code !== '220') {
                return;
            }
            await Promise.all([this.api.clientUpgradeToTls(), this.api.serverUpgradeToTls()]);
            this.stage = "tls";
        }
    }
}
