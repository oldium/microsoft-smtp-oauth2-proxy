// noinspection DuplicatedCode

import { describe, expect, test } from "@jest/globals";
import console from "console";
import { SMTPServer, SMTPServerSession } from "smtp-server";
import SMTPConnection from "nodemailer/lib/smtp-connection";
// noinspection SpellCheckingInspection
import selfsigned from "selfsigned";
import { Certificate } from "../lib/config";
import { createServer as createSmtpServer } from "./smtp_server";
import "./lib/test";
import { AddressInfo } from "node:net";

enum TlsState {
    FakeSecure,
    Secure,
    StartTls,
}

let selfSignedCertificate: Certificate | undefined;

function createSelfSignedCertificate(): Certificate {
    if (!selfSignedCertificate) {
        console.info("Generating self-signed certificate for SMTP server...");
        const attrs = [{ name: 'commonName', value: 'localhost' }];
        // noinspection SpellCheckingInspection
        const pems = selfsigned.generate(attrs, { keySize: 2048, days: 365 });
        selfSignedCertificate = { key: Buffer.from(pems.private, "binary"), cert: Buffer.from(pems.cert, "binary") };
    }

    return selfSignedCertificate;
}

async function constructSmtpServer(host: string, tlsState: TlsState, targetHost: string, targetPort: number, targetTlsState: TlsState, greetingName: string) {
    const server = createSmtpServer(
        {
            target: {
                host: targetHost,
                port: targetPort,
                secure: targetTlsState === TlsState.Secure,
                secured: targetTlsState === TlsState.FakeSecure
            },
            timeouts: { clientMs: 30000, },
            protocolInspectionDelayMs: 3000,
            maxLineLength: 4096,
            greetingName,
        },
        (username, password) => ({ username: username, accessToken: `${ username }:${ password }:token` }),
        (tlsState === TlsState.FakeSecure) ? { addresses: [host] } : undefined,
        (tlsState === TlsState.Secure) ? { addresses: [host], ...createSelfSignedCertificate() } : undefined,
        (tlsState === TlsState.StartTls) ? { addresses: [host], ...createSelfSignedCertificate() } : undefined,
    );
    await server.listen();
    return server;
}

async function constructTargetSmtpServer(host: string, tlsState: TlsState) {
    const connections = new Set<SMTPServerSession>();

    // noinspection SpellCheckingInspection
    const server = new SMTPServer({
        authMethods: ["XOAUTH2"],
        secure: tlsState === TlsState.FakeSecure || tlsState === TlsState.Secure,
        secured: tlsState === TlsState.FakeSecure,
        disabledCommands: (tlsState === TlsState.FakeSecure || tlsState === TlsState.Secure) ? ["STARTTLS"] : [],
        logger: true,
        async onAuth(auth, _session, callback) {
            console.log("Authorized user", auth);
            callback(null, { user: auth });
        },
        async onMailFrom(_address, _session, callback) {
            callback();
        },
        async onRcptTo(_address, _session, callback) {
            callback();
        },
        async onData(stream, _session, callback) {
            stream.pipe(process.stdout);
            stream.on("end", callback);
        },
        onConnect(session: SMTPServerSession, callback: (err?: (Error | null)) => void) {
            connections.add(session);
            callback();
        },
        onClose(session: SMTPServerSession) {
            connections.delete(session);
            if (connections.size === 0) {
                server.emit("closed");
            }
        }
    });

    server.on("close", () => {
        if (connections.size === 0) {
            server.emit("closed");
        }
    })

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, host, () => {
            server.off("error", reject);
            resolve();
        });
    });

    return server;
}

async function constructSmtpClient(host: string, port: number, tlsState: TlsState) {
    const client = new SMTPConnection({
        host: host,
        port: port,
        secure: tlsState === TlsState.Secure,
        // @ts-expect-error secured is not defined, but is recognized
        secured: tlsState === TlsState.FakeSecure,
        ignoreTLS: (tlsState === TlsState.FakeSecure || tlsState === TlsState.Secure),
        tls: {
            rejectUnauthorized: false,
        },
        logger: true,
        debug: true,
    });

    await new Promise<void>((resolve, reject) => {
        client.connect((err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });

    return client;
}

describe("Test SMTP server fake-secure handling", () => {
    test("Check clean shutdown with QUIT command", async () => {
        expect(createSmtpServer).toBeDefined();

        // Setup test server on unsecure port
        const testSmtpServer = await constructTargetSmtpServer("127.1.2.11", TlsState.FakeSecure);

        // Create interceptor SMTP server on unsecure port
        const smtpServer = await constructSmtpServer("127.1.2.10", TlsState.FakeSecure, "127.1.2.11", (testSmtpServer.server.address() as AddressInfo).port, TlsState.FakeSecure, "smtp.example.com");

        // Start test client
        const testClient = await constructSmtpClient("127.1.2.10", smtpServer.smtpPorts![0]!, TlsState.FakeSecure);

        // Authenticate
        await new Promise<void>((resolve, reject) => {
            testClient.login({ user: "username", pass: "password" }, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        // Prepare for disconnection
        const { promise: testClientClosePromise, resolve } = Promise.withResolvers<void>();
        testClient.once("end", resolve);

        // Quit
        await new Promise<void>((resolve) => {
            testClient.once("end", resolve);
            testClient.quit();
        });

        // Close the server
        await smtpServer.close();

        // Close the rest
        testClient.close();
        await testClientClosePromise;

        await new Promise<void>((resolve) => {
            testSmtpServer.once("closed", () => process.nextTick(resolve));
            testSmtpServer.close();
        });
    }, 300000);

    test("Check clean shutdown with client disconnection", async () => {
        expect(createSmtpServer).toBeDefined();

        // Create interceptor SMTP server on unsecure port
        // Setup test server on unsecure port
        const testSmtpServer = await constructTargetSmtpServer("127.1.2.11",  TlsState.FakeSecure);

        // Create interceptor SMTP server on unsecure port
        const smtpServer = await constructSmtpServer("127.1.2.10", TlsState.FakeSecure, "127.1.2.11", (testSmtpServer.server.address() as AddressInfo).port, TlsState.FakeSecure, "smtp.example.com");

        // Start test client
        const testClient = await constructSmtpClient("127.1.2.10", smtpServer.smtpPorts![0]!, TlsState.FakeSecure);
        // Authenticate
        await new Promise<void>((resolve, reject) => {
            testClient.login({ user: "username", pass: "password" }, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        // Close SMTP client
        await new Promise<void>((resolve) => { testClient.once("end", resolve); testClient.close(); });

        // Close the server
        await smtpServer.close();

        // Close the rest
        await new Promise<void>((resolve) => {
            testSmtpServer.once("closed", () => process.nextTick(resolve));
            testSmtpServer.close();
        });
    }, 300000);
});

describe("Test secure client towards STARTTLS server", () => {
    test("Check clean shutdown with QUIT command", async () => {
        expect(createSmtpServer).toBeDefined();

        // Setup test server on unsecure port
        const testSmtpServer = await constructTargetSmtpServer("127.1.2.11", TlsState.StartTls);

        // Create interceptor SMTP server on unsecure port
        const smtpServer = await constructSmtpServer("127.1.2.10", TlsState.FakeSecure, "127.1.2.11", (testSmtpServer.server.address() as AddressInfo).port, TlsState.StartTls, "smtp.example.com");

        // Start test client
        const testClient = await constructSmtpClient("127.1.2.10", smtpServer.smtpPorts![0]!, TlsState.FakeSecure);

        // Authenticate
        await new Promise<void>((resolve, reject) => {
            testClient.login({ user: "username", pass: "password" }, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        // Prepare for disconnection
        const { promise: testClientClosePromise, resolve } = Promise.withResolvers<void>();
        testClient.once("end", resolve);

        // Quit
        await new Promise<void>((resolve) => {
            testClient.once("end", resolve);
            testClient.quit();
        });

        // Close the server
        await smtpServer.close();

        // Close the rest
        testClient.close();
        await testClientClosePromise;

        await new Promise<void>((resolve) => {
            testSmtpServer.once("closed", () => process.nextTick(resolve));
            testSmtpServer.close();
        });
    }, 300000);
});

describe("Test STARTTLS client handling towards secured SMTP server", () => {
    test("Check clean shutdown with QUIT command", async () => {
        expect(createSmtpServer).toBeDefined();

        // Setup test server on unsecure port
        const testSmtpServer = await constructTargetSmtpServer("127.1.2.11", TlsState.FakeSecure);

        // Create interceptor SMTP server on unsecure port
        const smtpServer = await constructSmtpServer("127.1.2.10", TlsState.StartTls, "127.1.2.11", (testSmtpServer.server.address() as AddressInfo).port, TlsState.FakeSecure, "smtp.example.com");

        // Start test client
        const testClient = await constructSmtpClient("127.1.2.10", smtpServer.smtpStartTlsPorts![0]!, TlsState.StartTls);

        // Authenticate
        await new Promise<void>((resolve, reject) => {
            testClient.login({ user: "username", pass: "password" }, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        // Prepare for disconnection
        const { promise: testClientClosePromise, resolve } = Promise.withResolvers<void>();
        testClient.once("end", resolve);

        // Quit
        await new Promise<void>((resolve) => {
            testClient.once("end", resolve);
            testClient.quit();
        });

        // Close the server
        await smtpServer.close();

        // Close the rest
        testClient.close();
        await testClientClosePromise;

        await new Promise<void>((resolve) => {
            testSmtpServer.once("closed", () => process.nextTick(resolve));
            testSmtpServer.close();
        });
    }, 300000);
});

describe("Test STARTTLS client handling towards STARTTLS server", () => {
    test("Check clean shutdown with QUIT command", async () => {
        expect(createSmtpServer).toBeDefined();

        // Setup test server on unsecure port
        const testSmtpServer = await constructTargetSmtpServer("127.1.2.11", TlsState.StartTls);

        // Create interceptor SMTP server on unsecure port
        const smtpServer = await constructSmtpServer("127.1.2.10", TlsState.StartTls, "127.1.2.11", (testSmtpServer.server.address() as AddressInfo).port, TlsState.StartTls, "smtp.example.com");

        // Start test client
        const testClient = await constructSmtpClient("127.1.2.10", smtpServer.smtpStartTlsPorts![0]!, TlsState.StartTls);

        // Authenticate
        await new Promise<void>((resolve, reject) => {
            testClient.login({ user: "username", pass: "password" }, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        // Prepare for disconnection
        const { promise: testClientClosePromise, resolve } = Promise.withResolvers<void>();
        testClient.once("end", resolve);

        // Quit
        await new Promise<void>((resolve) => {
            testClient.once("end", resolve);
            testClient.quit();
        });

        // Close the server
        await smtpServer.close();

        // Close the rest
        testClient.close();
        await testClientClosePromise;

        await new Promise<void>((resolve) => {
            testSmtpServer.once("closed", () => process.nextTick(resolve));
            testSmtpServer.close();
        });
    }, 300000);
});

describe("Test TLS client handling towards TLS server", () => {
    test("Check clean shutdown with QUIT command", async () => {
        expect(createSmtpServer).toBeDefined();

        // Create interceptor SMTP server on unsecure port
        // Setup test server on unsecure port
        const testSmtpServer = await constructTargetSmtpServer("127.1.2.11", TlsState.Secure);
        // Create interceptor SMTP server on unsecure port
        const smtpServer = await constructSmtpServer("127.1.2.10", TlsState.Secure, "127.1.2.11", (testSmtpServer.server.address() as AddressInfo).port, TlsState.Secure, "smtp.example.com");
        // Start test client
        const testClient = await constructSmtpClient("127.1.2.10", smtpServer.smtpTlsPorts![0]!, TlsState.Secure);
        // Authenticate
        await new Promise<void>((resolve, reject) => {
            testClient.login({ user: "username", pass: "password" }, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        // Prepare for disconnection
        const { promise: testClientClosePromise, resolve } = Promise.withResolvers<void>();
        testClient.once("end", resolve);

        // Quit
        await new Promise<void>((resolve) => {
            testClient.once("end", resolve);
            testClient.quit();
        });

        // Close the server
        await smtpServer.close();

        // Close the rest
        testClient.close();
        await testClientClosePromise;

        await new Promise<void>((resolve) => {
            testSmtpServer.once("closed", () => process.nextTick(resolve));
            testSmtpServer.close();
        });
    }, 300000);
});
