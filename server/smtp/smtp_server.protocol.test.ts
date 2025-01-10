// noinspection DuplicatedCode,SpellCheckingInspection

import { afterEach, describe, jest, test } from "@jest/globals";
import console from "console";
import { base64Encode } from "./lib/base64";
import { MockClient, MockServer, SpySmtpServer } from "./lib/test";
import { default as _ } from "lodash";
import { Certificate } from "../lib/config";
import selfsigned from "selfsigned";
import assert from "node:assert";

function onUserAuth(username: string, password: string) {
    return password.indexOf("failed") === -1 ? {
        username: username,
        accessToken: `${ username }:${ password }:token`
    } : null;
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

enum ServerTlsType {
    Secured,
    Tls,
    StartTls,
    AutoTls
}

enum MockServerTlsType {
    Secured,
    Tls,
    StartTls,
}

function constructSmtpServer(host: string, serverType: ServerTlsType, targetHost: string, targetPort: number, targetTlsType: MockServerTlsType, greetingName: string, clientTimeoutMs?: number) {
    return new SpySmtpServer(
        {
            target: {
                host: targetHost,
                port: targetPort,
                secure: targetTlsType === MockServerTlsType.Tls,
                secured: targetTlsType === MockServerTlsType.Secured
            },
            timeouts: { clientMs: clientTimeoutMs ?? 30000, },
            protocolInspectionDelayMs: 3000,
            maxLineLength: 4096,
            greetingName,
        },
        onUserAuth,
        serverType === ServerTlsType.Secured ? { addresses: [host] } : undefined,
        serverType === ServerTlsType.Tls ? { addresses: [host], ...createSelfSignedCertificate() } : undefined,
        serverType === ServerTlsType.StartTls ? { addresses: [host], ...createSelfSignedCertificate() } : undefined,
        serverType === ServerTlsType.AutoTls ? { addresses: [host], ...createSelfSignedCertificate() } : undefined,
    );
}

let mockClient: MockClient;
let mockServer: MockServer;
let smtpServer: SpySmtpServer;

async function createMocks(serverType: ServerTlsType, mockServerType: MockServerTlsType, clientTimeoutMs?: number) {
    mockServer = new MockServer("127.1.2.11", undefined, createSelfSignedCertificate());
    await mockServer.listen();

    smtpServer = constructSmtpServer("127.1.2.10", serverType, "127.1.2.11", mockServer.port, mockServerType, "smtp.example.com", clientTimeoutMs);
    await smtpServer.listen();

    switch (serverType) {
        case ServerTlsType.Secured:
            mockClient = new MockClient("127.1.2.10", smtpServer.smtpPorts![0]!);
            break;
        case ServerTlsType.Tls:
            mockClient = new MockClient("127.1.2.10", smtpServer.smtpTlsPorts![0]!);
            break;
        case ServerTlsType.StartTls:
            mockClient = new MockClient("127.1.2.10", smtpServer.smtpStartTlsPorts![0]!);
            break;
        case ServerTlsType.AutoTls:
            mockClient = new MockClient("127.1.2.10", smtpServer.smtpAutoTlsPorts![0]!);
            break;
    }
}

afterEach(async () => {
    jest.useRealTimers();
    await Promise.all([
        mockClient.close(),
        mockServer.close(),
        smtpServer.close(),
    ]);
});

describe("Test connect and disconnect handling", () => {
    test("Check clean shutdown with QUIT command", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await mockServer.close();
        await mockClient.close();

        // Close the server
        await smtpServer.expectEnd();
        await smtpServer.close();
    }, 300000);

    test("Check client disconnection without QUIT command", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        // Disconnect client
        await mockClient.close();

        // Expect server to close the connection
        await smtpServer.expectEnd();

        // Close the server
        await smtpServer.close();

        // Disconnect server
        await mockServer.close();
    }, 300000);
});

describe("Test STARTTLS handling", () => {
    test("Check STARTTLS upgrade on client side", async () => {
        await createMocks(ServerTlsType.StartTls, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockClient.expect("220 2.0.0 Ready to start TLS\r\n");
        await mockClient.upgradeToTls();

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check STARTTLS upgrade on server side", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.StartTls);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250-AUTH XOAUTH2\r\n250 STARTTLS\r\n");
        await mockServer.expect("STARTTLS\r\n");
        await mockServer.send("220 2.0.0 Ready to start TLS\r\n");
        await mockServer.upgradeToTls();
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check STARTTLS upgrade on both sides", async () => {
        await createMocks(ServerTlsType.StartTls, MockServerTlsType.StartTls);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockServer.expect("STARTTLS\r\n");
        await mockServer.send("220 2.0.0 Ready to start TLS\r\n");
        await mockClient.expect("220 2.0.0 Ready to start TLS\r\n");
        await Promise.all([mockClient.upgradeToTls(), mockServer.upgradeToTls()]);

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);
});

describe("Test TLS handling", () => {
    test("Check STARTTLS upgrade on client side, TLS on server side", async () => {
        await createMocks(ServerTlsType.StartTls, MockServerTlsType.Tls);
        await mockClient.connect();
        await mockServer.accept();
        await mockServer.upgradeToTls();

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockClient.expect("220 2.0.0 Ready to start TLS\r\n");
        await mockClient.upgradeToTls();

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check TLS on client side, STARTTLS upgrade on server side", async () => {
        await createMocks(ServerTlsType.Tls, MockServerTlsType.StartTls);
        await mockClient.connect();
        await mockClient.upgradeToTls();
        await mockServer.accept();

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250-AUTH XOAUTH2\r\n250 STARTTLS\r\n");
        await mockServer.expect("STARTTLS\r\n");
        await mockServer.send("220 2.0.0 Ready to start TLS\r\n");
        await mockServer.upgradeToTls();
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check TLS on both sides", async () => {
        await createMocks(ServerTlsType.Tls, MockServerTlsType.Tls);
        await mockClient.connect();
        await mockClient.upgradeToTls();
        await mockServer.accept();
        await mockServer.upgradeToTls();

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);
});

describe("Test auto-TLS handling", () => {
    test("Check STARTTLS upgrade on client side", async () => {
        await createMocks(ServerTlsType.AutoTls, MockServerTlsType.Secured);

        jest.useFakeTimers();

        await mockClient.connect();

        await jest.advanceTimersByTimeAsync(4000);
        jest.useRealTimers();

        await mockServer.accept();

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockClient.expect("220 2.0.0 Ready to start TLS\r\n");
        await mockClient.upgradeToTls();

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check STARTTLS upgrade on client side with early EHLO", async () => {
        await createMocks(ServerTlsType.AutoTls, MockServerTlsType.Secured);

        await mockClient.connect();
        await mockClient.send("EHLO test.local\r\n");

        await mockServer.accept();

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockClient.expect("220 2.0.0 Ready to start TLS\r\n");
        await mockClient.upgradeToTls();

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check TLS on client side", async () => {
        await createMocks(ServerTlsType.AutoTls, MockServerTlsType.Secured);
        await mockClient.connect();
        await mockClient.upgradeToTls();
        await mockServer.accept();

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);
});

describe("Test AUTH handling", () => {
    test("Check succeeded LOGIN authentication", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH LOGIN\r\n");
        await mockClient.expect("334 VXNlcm5hbWU6\r\n");
        await mockClient.send(base64Encode("test-username") + "\r\n");
        await mockClient.expect("334 UGFzc3dvcmQ6\r\n");
        await mockClient.send(base64Encode("test-password") + "\r\n");

        await mockServer.expect("AUTH XOAUTH2 " + base64Encode(["user=test-username", "auth=Bearer test-username:test-password:token", "", ""].join("\x01")) + "\r\n");
        await mockServer.send("235 2.7.0 Authentication successful\r\n");
        await mockClient.expect("235 2.7.0 Authentication successful\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check succeeded PLAIN authentication with initial response argument", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH PLAIN " + base64Encode(["", "test-username", "test-password"].join("\x00")) + "\r\n");
        await mockServer.expect("AUTH XOAUTH2 " + base64Encode(["user=test-username", "auth=Bearer test-username:test-password:token", "", ""].join("\x01")) + "\r\n");
        await mockServer.send("235 2.7.0 Authentication successful\r\n");
        await mockClient.expect("235 2.7.0 Authentication successful\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check succeeded PLAIN authentication", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("334 \r\n");
        await mockClient.send(base64Encode(["", "test-username", "test-password"].join("\x00")) + "\r\n");
        await mockServer.expect("AUTH XOAUTH2 " + base64Encode(["user=test-username", "auth=Bearer test-username:test-password:token", "", ""].join("\x01")) + "\r\n");
        await mockServer.send("235 2.7.0 Authentication successful\r\n");
        await mockClient.expect("235 2.7.0 Authentication successful\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check failed LOGIN authentication", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH LOGIN\r\n");
        await mockClient.expect("334 VXNlcm5hbWU6\r\n");
        await mockClient.send(base64Encode("test-username") + "\r\n");
        await mockClient.expect("334 UGFzc3dvcmQ6\r\n");
        await mockClient.send(base64Encode("test-password-failed") + "\r\n");
        await mockClient.expect("535 5.7.8 Authentication failed\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check failed PLAIN authentication with initial response argument", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH PLAIN " + base64Encode(["", "test-username", "test-password-failed"].join("\x00")) + "\r\n");
        await mockClient.expect("535 5.7.8 Authentication failed\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check failed PLAIN authentication", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("334 \r\n");
        await mockClient.send(base64Encode(["", "test-username", "test-password-failed"].join("\x00")) + "\r\n");
        await mockClient.expect("535 5.7.8 Authentication failed\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);
});

describe("Test mail data handling", () => {
    test("Check sending email with DATA", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("334 \r\n");
        await mockClient.send(base64Encode(["", "test-username", "test-password"].join("\x00")) + "\r\n");
        await mockServer.expect("AUTH XOAUTH2 " + base64Encode(["user=test-username", "auth=Bearer test-username:test-password:token", "", ""].join("\x01")) + "\r\n");
        await mockServer.send("235 2.7.0 Authentication successful\r\n");
        await mockClient.expect("235 2.7.0 Authentication successful\r\n");

        await mockClient.send("MAIL FROM:<from@example.com>\r\n");
        await mockServer.expect("MAIL FROM:<from@example.com>\r\n");
        await mockServer.send("250 2.1.0 Sender OK\r\n");
        await mockClient.expect("250 2.1.0 Sender OK\r\n");

        await mockClient.send("RCPT TO:<to@example.com>\r\n");
        await mockServer.expect("RCPT TO:<to@example.com>\r\n");
        await mockServer.send("250 2.1.5 Recipient OK\r\n");
        await mockClient.expect("250 2.1.5 Recipient OK\r\n");

        await mockClient.send("DATA\r\n");
        await mockServer.expect("DATA\r\n");
        await mockServer.send("354 Start mail input; end with <CRLF>.<CRLF>\r\n");
        await mockClient.expect("354 Start mail input; end with <CRLF>.<CRLF>\r\n");

        await mockClient.send("From: Me\r\nTo: You\r\nSubject: Test Message\r\nThis is a test message.\r\n..Not so fast.\r\n.\r\n");
        await mockServer.expect("From: Me\r\nTo: You\r\nSubject: Test Message\r\nThis is a test message.\r\n..Not so fast.\r\n.\r\n");
        await mockServer.send("250 2.0.0 OK: Message accepted for delivery\r\n");
        await mockClient.expect("250 2.0.0 OK: Message accepted for delivery\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check sending email with big DATA", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("334 \r\n");
        await mockClient.send(base64Encode(["", "test-username", "test-password"].join("\x00")) + "\r\n");
        await mockServer.expect("AUTH XOAUTH2 " + base64Encode(["user=test-username", "auth=Bearer test-username:test-password:token", "", ""].join("\x01")) + "\r\n");
        await mockServer.send("235 2.7.0 Authentication successful\r\n");
        await mockClient.expect("235 2.7.0 Authentication successful\r\n");

        await mockClient.send("MAIL FROM:<from@example.com>\r\n");
        await mockServer.expect("MAIL FROM:<from@example.com>\r\n");
        await mockServer.send("250 2.1.0 Sender OK\r\n");
        await mockClient.expect("250 2.1.0 Sender OK\r\n");

        await mockClient.send("RCPT TO:<to@example.com>\r\n");
        await mockServer.expect("RCPT TO:<to@example.com>\r\n");
        await mockServer.send("250 2.1.5 Recipient OK\r\n");
        await mockClient.expect("250 2.1.5 Recipient OK\r\n");

        await mockClient.send("DATA\r\n");
        await mockServer.expect("DATA\r\n");
        await mockServer.send("354 Start mail input; end with <CRLF>.<CRLF>\r\n");
        await mockClient.expect("354 Start mail input; end with <CRLF>.<CRLF>\r\n");

        await mockClient.send("From: Me\r\nTo: You\r\nSubject: Test Message\r\nThis is a test message.\r\n..Not so fast.\r\n" + _.repeat("This is a very long email.\r\n", 1024) + ".\r\n");
        await mockServer.expect("From: Me\r\nTo: You\r\nSubject: Test Message\r\nThis is a test message.\r\n..Not so fast.\r\n" + _.repeat("This is a very long email.\r\n", 1024) + ".\r\n");
        await mockServer.send("250 2.0.0 OK: Message accepted for delivery\r\n");
        await mockClient.expect("250 2.0.0 OK: Message accepted for delivery\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check sending email with BDAT", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("334 \r\n");
        await mockClient.send(base64Encode(["", "test-username", "test-password"].join("\x00")) + "\r\n");
        await mockServer.expect("AUTH XOAUTH2 " + base64Encode(["user=test-username", "auth=Bearer test-username:test-password:token", "", ""].join("\x01")) + "\r\n");
        await mockServer.send("235 2.7.0 Authentication successful\r\n");
        await mockClient.expect("235 2.7.0 Authentication successful\r\n");

        await mockClient.send("MAIL FROM:<from@example.com>\r\n");
        await mockServer.expect("MAIL FROM:<from@example.com>\r\n");
        await mockServer.send("250 2.1.0 Sender OK\r\n");
        await mockClient.expect("250 2.1.0 Sender OK\r\n");

        await mockClient.send("RCPT TO:<to@example.com>\r\n");
        await mockServer.expect("RCPT TO:<to@example.com>\r\n");
        await mockServer.send("250 2.1.5 Recipient OK\r\n");
        await mockClient.expect("250 2.1.5 Recipient OK\r\n");

        const message = "From: Me\r\nTo: You\r\nSubject: Test Message\r\n\r\nThis is a test message.\r\n..Not so fast.\r\n";
        await mockClient.send("BDAT 85 LAST\r\n");
        await mockClient.send(message);
        await mockServer.expect("BDAT 85 LAST\r\n", true);
        await mockServer.expect(message);

        await mockServer.send("250 Message OK, 85 octets received\r\n");
        await mockClient.expect("250 Message OK, 85 octets received\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check sending email with big BDAT", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("334 \r\n");
        await mockClient.send(base64Encode(["", "test-username", "test-password"].join("\x00")) + "\r\n");
        await mockServer.expect("AUTH XOAUTH2 " + base64Encode(["user=test-username", "auth=Bearer test-username:test-password:token", "", ""].join("\x01")) + "\r\n");
        await mockServer.send("235 2.7.0 Authentication successful\r\n");
        await mockClient.expect("235 2.7.0 Authentication successful\r\n");

        await mockClient.send("MAIL FROM:<from@example.com>\r\n");
        await mockServer.expect("MAIL FROM:<from@example.com>\r\n");
        await mockServer.send("250 2.1.0 Sender OK\r\n");
        await mockClient.expect("250 2.1.0 Sender OK\r\n");

        await mockClient.send("RCPT TO:<to@example.com>\r\n");
        await mockServer.expect("RCPT TO:<to@example.com>\r\n");
        await mockServer.send("250 2.1.5 Recipient OK\r\n");
        await mockClient.expect("250 2.1.5 Recipient OK\r\n");

        const message = "From: Me\r\nTo: You\r\nSubject: Test Message\r\n\r\nThis is a test message.\r\n..Not so fast.\r\n";
        await mockClient.send("BDAT 85\r\n");
        await mockClient.send(message);
        await mockServer.expect("BDAT 85\r\n", true);
        await mockServer.expect(message);
        await mockServer.send("250 85 octets received\r\n");
        await mockClient.expect("250 85 octets received\r\n");

        const bigMessage = _.repeat("This is a very long email.\r\n", 1024);
        await mockClient.send("BDAT 28672\r\n");
        await mockClient.send(bigMessage);
        await mockServer.expect("BDAT 28672\r\n", true);
        await mockServer.expect(bigMessage);
        await mockServer.send("250 28672 octets received\r\n");
        await mockClient.expect("250 28672 octets received\r\n");

        await mockClient.send("BDAT 28672\r\n");
        await mockClient.send(bigMessage);
        await mockServer.expect("BDAT 28672\r\n", true);
        await mockServer.expect(bigMessage);
        await mockServer.send("250 28672 octets received\r\n");
        await mockClient.expect("250 28672 octets received\r\n");

        await mockClient.send("BDAT 0 LAST\r\n");
        await mockServer.expect("BDAT 0 LAST\r\n");
        await mockServer.send("250 Message OK, 57429 octets received\r\n");
        await mockClient.expect("250 Message OK, 57429 octets received\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);
});

describe("Test pipelining handling", () => {
    test("Check pipeline sending email with DATA", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("334 \r\n");
        await mockClient.send(base64Encode(["", "test-username", "test-password"].join("\x00")) + "\r\n");
        await mockServer.expect("AUTH XOAUTH2 " + base64Encode(["user=test-username", "auth=Bearer test-username:test-password:token", "", ""].join("\x01")) + "\r\n");
        await mockServer.send("235 2.7.0 Authentication successful\r\n");
        await mockClient.expect("235 2.7.0 Authentication successful\r\n");

        await mockClient.send("MAIL FROM:<from@example.com>\r\n");
        await mockServer.expect("MAIL FROM:<from@example.com>\r\n");
        await mockClient.send("RCPT TO:<to@example.com>\r\n");
        await mockServer.expect("RCPT TO:<to@example.com>\r\n");
        await mockClient.send("DATA\r\n");
        await mockServer.expect("DATA\r\n");
        // RFC 5321, Section 3.3, data waits for the response from the server

        await mockServer.send("250 2.1.0 Sender OK\r\n");
        await mockClient.expect("250 2.1.0 Sender OK\r\n");
        await mockServer.send("250 2.1.5 Recipient OK\r\n");
        await mockClient.expect("250 2.1.5 Recipient OK\r\n");
        await mockServer.send("354 Start mail input; end with <CRLF>.<CRLF>\r\n");
        await mockClient.expect("354 Start mail input; end with <CRLF>.<CRLF>\r\n");

        await mockClient.send("From: Me\r\nTo: You\r\nSubject: Test Message\r\nThis is a test message.\r\n..Not so fast.\r\n.\r\n");
        await mockServer.expect("From: Me\r\nTo: You\r\nSubject: Test Message\r\nThis is a test message.\r\n..Not so fast.\r\n.\r\n");
        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");

        await mockServer.send("250 2.0.0 OK: Message accepted for delivery\r\n");
        await mockClient.expect("250 2.0.0 OK: Message accepted for delivery\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check pipeline sending email with BDAT", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("334 \r\n");
        await mockClient.send(base64Encode(["", "test-username", "test-password"].join("\x00")) + "\r\n");
        await mockServer.expect("AUTH XOAUTH2 " + base64Encode(["user=test-username", "auth=Bearer test-username:test-password:token", "", ""].join("\x01")) + "\r\n");
        await mockServer.send("235 2.7.0 Authentication successful\r\n");
        await mockClient.expect("235 2.7.0 Authentication successful\r\n");

        await mockClient.send("MAIL FROM:<from@example.com>\r\n");
        await mockServer.expect("MAIL FROM:<from@example.com>\r\n");
        await mockClient.send("RCPT TO:<to@example.com>\r\n");
        await mockServer.expect("RCPT TO:<to@example.com>\r\n");
        const message = "From: Me\r\nTo: You\r\nSubject: Test Message\r\nThis is a test message.\r\n..Not so fast.\r\n";
        await mockClient.send("BDAT 85 LAST\r\n");
        await mockClient.send(message);
        await mockServer.expect("BDAT 85 LAST\r\n", true);
        await mockServer.expect(message);
        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");

        await mockServer.send("250 2.1.0 Sender OK\r\n");
        await mockClient.expect("250 2.1.0 Sender OK\r\n");
        await mockServer.send("250 2.1.5 Recipient OK\r\n");
        await mockClient.expect("250 2.1.5 Recipient OK\r\n");
        await mockServer.send("250 Message OK, 85 octets received\r\n");
        await mockClient.expect("250 Message OK, 85 octets received\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check pipeline sending email with big BDAT", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("334 \r\n");
        await mockClient.send(base64Encode(["", "test-username", "test-password"].join("\x00")) + "\r\n");
        await mockServer.expect("AUTH XOAUTH2 " + base64Encode(["user=test-username", "auth=Bearer test-username:test-password:token", "", ""].join("\x01")) + "\r\n");
        await mockServer.send("235 2.7.0 Authentication successful\r\n");
        await mockClient.expect("235 2.7.0 Authentication successful\r\n");

        await mockClient.send("MAIL FROM:<from@example.com>\r\n");
        await mockServer.expect("MAIL FROM:<from@example.com>\r\n");
        await mockClient.send("RCPT TO:<to@example.com>\r\n");
        await mockServer.expect("RCPT TO:<to@example.com>\r\n");
        const message = "From: Me\r\nTo: You\r\nSubject: Test Message\r\nThis is a test message.\r\n..Not so fast\r\n.\r\n";
        assert(message.length === 85);
        await mockClient.send("BDAT 85\r\n");
        await mockClient.send(message);
        await mockServer.expect("BDAT 85\r\n", true);
        await mockServer.expect(message);

        const bigMessage = _.repeat("This is a very long email.\r\n", 1024);
        assert(bigMessage.length === 28672);
        await mockClient.send("BDAT 28672\r\n");
        await mockClient.send(bigMessage);
        await mockServer.expect("BDAT 28672\r\n", true);
        await mockServer.expect(bigMessage);
        await mockClient.send("BDAT 28672\r\n");
        await mockClient.send(bigMessage);
        await mockServer.expect("BDAT 28672\r\n", true);
        await mockServer.expect(bigMessage);
        await mockClient.send("BDAT 0 LAST\r\n");
        await mockServer.expect("BDAT 0 LAST\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");

        await mockServer.send("250 2.1.0 Sender OK\r\n");
        await mockClient.expect("250 2.1.0 Sender OK\r\n");
        await mockServer.send("250 2.1.5 Recipient OK\r\n");
        await mockClient.expect("250 2.1.5 Recipient OK\r\n");
        await mockServer.send("250 85 octets received\r\n");
        await mockClient.expect("250 85 octets received\r\n");
        await mockServer.send("250 28672 octets received\r\n");
        await mockClient.expect("250 28672 octets received\r\n");
        await mockServer.send("250 28672 octets received\r\n");
        await mockClient.expect("250 28672 octets received\r\n");
        await mockServer.send("250 Message OK, 57429 octets received\r\n");
        await mockClient.expect("250 Message OK, 57429 octets received\r\n");
        await mockServer.send("221 Bye\r\n");
        mockServer.end();
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);
});

describe("Test protected commands", () => {
    test("Check greeting state rejections with STARTTLS connection", async () => {
        await createMocks(ServerTlsType.StartTls, MockServerTlsType.StartTls);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("MAIL FROM:test@example.com\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("RCVD TO:test@example.com\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("DATA\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("BDAT 256 LAST\r\n");
        await mockClient.send(Buffer.from(Array.from({ length: 256 }, (_, i) => (i + 1) % 256)));
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");

        await mockClient.send("NOOP\r\n");
        await mockServer.expect("NOOP\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");
        await mockClient.send("RSET\r\n");
        await mockServer.expect("RSET\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check greeting state rejections with secured connection", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("MAIL FROM:test@example.com\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("RCVD TO:test@example.com\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("DATA\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("BDAT 256 LAST\r\n");
        await mockClient.send(Buffer.from(Array.from({ length: 256 }, (_, i) => (i + 1) % 256)));
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");

        await mockClient.send("NOOP\r\n");
        await mockServer.expect("NOOP\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");
        await mockClient.send("RSET\r\n");
        await mockServer.expect("RSET\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check greeting state rejections with TLS connection", async () => {
        await createMocks(ServerTlsType.Tls, MockServerTlsType.Tls);
        await mockClient.connect();
        await mockClient.upgradeToTls();
        await mockServer.accept();
        await mockServer.upgradeToTls();

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("MAIL FROM:test@example.com\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("RCVD TO:test@example.com\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("DATA\r\n");
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");
        await mockClient.send("BDAT 256 LAST\r\n");
        await mockClient.send(Buffer.from(Array.from({ length: 256 }, (_, i) => (i + 1) % 256)));
        await mockClient.expect("503 5.5.1 Send HELO/EHLO first\r\n");

        await mockClient.send("NOOP\r\n");
        await mockServer.expect("NOOP\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");
        await mockClient.send("RSET\r\n");
        await mockServer.expect("RSET\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check HELO-sent state rejections with HELO on STARTTLS connection", async () => {
        await createMocks(ServerTlsType.StartTls, MockServerTlsType.StartTls);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("HELO test.local\r\n");
        await mockServer.expect("HELO test.local\r\n");
        await mockServer.send("250 test.local Hello\r\n");
        await mockClient.expect("250 test.local Hello\r\n");

        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("530 5.5.1 Must issue a STARTTLS command first\r\n");
        await mockClient.send("MAIL FROM:test@example.com\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("RCVD TO:test@example.com\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("DATA\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("BDAT 256 LAST\r\n");
        await mockClient.send(Buffer.from(Array.from({ length: 256 }, (_, i) => (i + 1) % 256)));
        await mockClient.expect("530 5.7.0 Authentication required\r\n");

        await mockClient.send("NOOP\r\n");
        await mockServer.expect("NOOP\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");
        await mockClient.send("RSET\r\n");
        await mockServer.expect("RSET\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check HELO-sent state rejections with EHLO on STARTTLS connection", async () => {
        await createMocks(ServerTlsType.StartTls, MockServerTlsType.StartTls);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS\r\n");

        await mockClient.send("AUTH PLAIN\r\n");
        await mockClient.expect("530 5.5.1 Must issue a STARTTLS command first\r\n");
        await mockClient.send("MAIL FROM:test@example.com\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("RCVD TO:test@example.com\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("DATA\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("BDAT 256 LAST\r\n");
        await mockClient.send(Buffer.from(Array.from({ length: 256 }, (_, i) => (i + 1) % 256)));
        await mockClient.expect("530 5.7.0 Authentication required\r\n");

        await mockClient.send("NOOP\r\n");
        await mockServer.expect("NOOP\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");
        await mockClient.send("RSET\r\n");
        await mockServer.expect("RSET\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check TLS-active state rejections on STARTTLS connection", async () => {
        await createMocks(ServerTlsType.StartTls, MockServerTlsType.StartTls);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250-AUTH XOAUTH2\r\n250 STARTTLS\r\n");
        await mockClient.expect("250-test.local Hello\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockServer.expect("STARTTLS\r\n");
        await mockServer.send("220 2.0.0 Ready to start TLS\r\n");
        await mockClient.expect("220 2.0.0 Ready to start TLS\r\n");
        await Promise.all([mockClient.upgradeToTls(), mockServer.upgradeToTls()]);

        await mockClient.send("STARTTLS\r\n");
        await mockClient.expect("503 5.5.1 Connection already secured\r\n");
        await mockClient.send("MAIL FROM:test@example.com\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("RCVD TO:test@example.com\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("DATA\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("BDAT 256 LAST\r\n");
        await mockClient.send(Buffer.from(Array.from({ length: 256 }, (_, i) => (i + 1) % 256)));
        await mockClient.expect("530 5.7.0 Authentication required\r\n");

        await mockClient.send("NOOP\r\n");
        await mockServer.expect("NOOP\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");
        await mockClient.send("RSET\r\n");
        await mockServer.expect("RSET\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check TLS-active state rejections on secured connection", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockClient.expect("503 5.5.1 Connection already secured\r\n");
        await mockClient.send("MAIL FROM:test@example.com\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("RCVD TO:test@example.com\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("DATA\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("BDAT 256 LAST\r\n");
        await mockClient.send(Buffer.from(Array.from({ length: 256 }, (_, i) => (i + 1) % 256)));
        await mockClient.expect("530 5.7.0 Authentication required\r\n");

        await mockClient.send("NOOP\r\n");
        await mockServer.expect("NOOP\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");
        await mockClient.send("RSET\r\n");
        await mockServer.expect("RSET\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check TLS-active state rejections on TLS connection", async () => {
        await createMocks(ServerTlsType.Tls, MockServerTlsType.Tls);
        await mockClient.connect();
        await mockClient.upgradeToTls();
        await mockServer.accept();
        await mockServer.upgradeToTls();

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockClient.expect("503 5.5.1 Connection already secured\r\n");
        await mockClient.send("MAIL FROM:test@example.com\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("RCVD TO:test@example.com\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("DATA\r\n");
        await mockClient.expect("530 5.7.0 Authentication required\r\n");
        await mockClient.send("BDAT 256 LAST\r\n");
        await mockClient.send(Buffer.from(Array.from({ length: 256 }, (_, i) => (i + 1) % 256)));
        await mockClient.expect("530 5.7.0 Authentication required\r\n");

        await mockClient.send("NOOP\r\n");
        await mockServer.expect("NOOP\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");
        await mockClient.send("RSET\r\n");
        await mockServer.expect("RSET\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check authenticated state rejections on secured connection", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH PLAIN " + base64Encode(["", "test-username", "test-password"].join("\x00")) + "\r\n");
        await mockServer.expect("AUTH XOAUTH2 " + base64Encode(["user=test-username", "auth=Bearer test-username:test-password:token", "", ""].join("\x01")) + "\r\n");
        await mockServer.send("235 2.7.0 Authentication successful\r\n");
        await mockClient.expect("235 2.7.0 Authentication successful\r\n");

        await mockClient.send("AUTH PLAIN " + base64Encode(["", "test-username", "test-password"].join("\x00")) + "\r\n");
        await mockClient.expect("503 5.5.1 Bad sequence of commands\r\n");
        await mockClient.send("STARTTLS\r\n");
        await mockClient.expect("503 5.5.1 Connection already secured\r\n");

        await mockClient.send("NOOP\r\n");
        await mockServer.expect("NOOP\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");
        await mockClient.send("RSET\r\n");
        await mockServer.expect("RSET\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);

    test("Check authenticated state rejections on TLS connection", async () => {
        await createMocks(ServerTlsType.Tls, MockServerTlsType.Tls);
        await mockClient.connect();
        await mockClient.upgradeToTls();
        await mockServer.accept();
        await mockServer.upgradeToTls();

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await mockClient.send("AUTH PLAIN " + base64Encode(["", "test-username", "test-password"].join("\x00")) + "\r\n");
        await mockServer.expect("AUTH XOAUTH2 " + base64Encode(["user=test-username", "auth=Bearer test-username:test-password:token", "", ""].join("\x01")) + "\r\n");
        await mockServer.send("235 2.7.0 Authentication successful\r\n");
        await mockClient.expect("235 2.7.0 Authentication successful\r\n");

        await mockClient.send("AUTH PLAIN " + base64Encode(["", "test-username", "test-password"].join("\x00")) + "\r\n");
        await mockClient.expect("503 5.5.1 Bad sequence of commands\r\n");
        await mockClient.send("STARTTLS\r\n");
        await mockClient.expect("503 5.5.1 Connection already secured\r\n");

        await mockClient.send("NOOP\r\n");
        await mockServer.expect("NOOP\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");
        await mockClient.send("RSET\r\n");
        await mockServer.expect("RSET\r\n");
        await mockServer.send("250 OK\r\n");
        await mockClient.expect("250 OK\r\n");

        await mockClient.send("QUIT\r\n");
        await mockServer.expect("QUIT\r\n");
        await mockServer.send("221 Bye\r\n");
        await mockClient.expect("221 Bye\r\n");

        await smtpServer.expectEnd();
        await mockServer.close();
        await mockClient.close();
        await smtpServer.close();
    }, 300000);
});

describe("Test connection closed and timeout handling", () => {
    test("Check initial connection closed handling", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);

        // Connection is always accepted
        await mockClient.connect();

        // Close mock server and pending connections
        await mockServer.close();

        await smtpServer.expectError("Unexpected end of data");
        await smtpServer.close();

        await mockClient.close();
    }, 300000);

    test("Check initial connection client disconnection handling", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);

        // Connection is always accepted
        await Promise.all([mockClient.connect(), mockServer.accept()])

        // Client does not want to wait for server 220 response
        mockClient.end();

        await smtpServer.expectError("Unexpected connection close before initial handshake");
        await smtpServer.close();

        await mockServer.close();
        await mockClient.close();
    }, 300000);

    test("Check auto-TLS initial connection client disconnection handling", async () => {
        await createMocks(ServerTlsType.AutoTls, MockServerTlsType.Secured);

        // Connection is always accepted
        await mockClient.connect();

        // Client does not want to wait for server 220 response
        mockClient.end();

        await smtpServer.expectError("Unexpected connection close during protocol detection");
        await smtpServer.close();

        await mockServer.close();
        await mockClient.close();
    }, 300000);

    test("Check first client command timeout handling", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);

        // Connection is always accepted
        await Promise.all([mockClient.connect(), mockServer.accept()])

        jest.useFakeTimers();

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await jest.advanceTimersByTimeAsync(60000);
        jest.useRealTimers();

        await smtpServer.expectError("Timeout");
        await smtpServer.close();

        await mockServer.close();
        await mockClient.close();
    }, 300000);

    test("Check first server reply timeout handling by client", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);

        // Connection is always accepted
        await Promise.all([mockClient.connect(), mockServer.accept()])

        jest.useFakeTimers();

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");

        await jest.advanceTimersByTimeAsync(60000);
        jest.useRealTimers();

        mockClient.end();

        await smtpServer.expectError("Unexpected connection close while waiting for server response");
        await smtpServer.close();

        await mockServer.close();
        await mockClient.close();
    }, 300000);

    test("Check second client command timeout handling", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);

        // Connection is always accepted
        await Promise.all([mockClient.connect(), mockServer.accept()])

        jest.useFakeTimers();

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");
        await jest.advanceTimersByTimeAsync(1000);
        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");

        await jest.advanceTimersByTimeAsync(60000);
        jest.useRealTimers();

        await smtpServer.expectError("Timeout");
        await smtpServer.close();

        await mockServer.close();
        await mockClient.close();
    }, 300000);

    test("Check second server reply timeout handling by client", async () => {
        await createMocks(ServerTlsType.Secured, MockServerTlsType.Secured);

        // Connection is always accepted
        await Promise.all([mockClient.connect(), mockServer.accept()])

        jest.useFakeTimers();

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");
        await jest.advanceTimersByTimeAsync(1000);
        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250 AUTH PLAIN LOGIN\r\n");
        await jest.advanceTimersByTimeAsync(1000);
        await mockClient.send("NOOP\r\n");
        await mockServer.expect("NOOP\r\n");

        await jest.advanceTimersByTimeAsync(60000);
        jest.useRealTimers();

        mockClient.end();

        await smtpServer.expectError("Unexpected connection close while waiting for server response");
        await smtpServer.close();

        await mockServer.close();
        await mockClient.close();
    }, 300000);

    test("Check STARTTLS upgrade failure (close) on client side", async () => {
        await createMocks(ServerTlsType.StartTls, MockServerTlsType.StartTls);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockServer.expect("STARTTLS\r\n");
        await mockServer.send("220 2.0.0 Ready to start TLS\r\n");
        await mockClient.expect("220 2.0.0 Ready to start TLS\r\n");

        mockClient.end();
        await mockServer.upgradeToTls().catch(() => {});

        await smtpServer.expectError("TLS connection closed");
        await smtpServer.close();

        await mockServer.close();
        await mockClient.close();
    }, 300000);

    test("Check STARTTLS upgrade failure (close) on server side", async () => {
        await createMocks(ServerTlsType.StartTls, MockServerTlsType.StartTls);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockServer.expect("STARTTLS\r\n");
        await mockServer.send("220 2.0.0 Ready to start TLS\r\n");
        await mockClient.expect("220 2.0.0 Ready to start TLS\r\n");

        mockServer.end()
        await mockClient.upgradeToTls().catch(() => {});

        await smtpServer.expectError();
        await smtpServer.close();

        await mockServer.close();
        await mockClient.close();
    }, 300000);

    test("Check STARTTLS upgrade failure (close) on both sides", async () => {
        await createMocks(ServerTlsType.StartTls, MockServerTlsType.StartTls);
        await Promise.all([mockClient.connect(), mockServer.accept()])

        await mockServer.send("220 test.local ESMTP\r\n");
        await mockClient.expect("220-test.local ESMTP\r\n220 Welcome to microsoft-smtp-oauth2-proxy @ smtp.example.com\r\n");

        await mockClient.send("EHLO test.local\r\n");
        await mockServer.expect("EHLO test.local\r\n");
        await mockServer.send("250-test.local Hello\r\n250 AUTH XOAUTH2\r\n");
        await mockClient.expect("250-test.local Hello\r\n250-AUTH PLAIN LOGIN\r\n250 STARTTLS\r\n");

        await mockClient.send("STARTTLS\r\n");
        await mockServer.expect("STARTTLS\r\n");
        await mockServer.send("220 2.0.0 Ready to start TLS\r\n");
        await mockClient.expect("220 2.0.0 Ready to start TLS\r\n");

        mockClient.end();
        mockServer.end();

        await smtpServer.expectError();
        await smtpServer.close();

        await mockServer.close();
        await mockClient.close();
    }, 300000);

});
