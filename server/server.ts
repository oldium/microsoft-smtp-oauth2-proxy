import "localenv";
import { createServer as createHttpServer, Server } from "http";
import { createServer as createHttpsServer } from "https";
import next from "next";
import config from "./lib/config";
import { endDb, getDb } from "./lib/db";
import { init as initMicrosoft, startRefreshJob } from "./lib/microsoft";
import express from "express";
import routes from "./routes";
import { parse } from "node:url";
import cors from "cors";
import { createServer as createSmtpServer } from "./smtp/smtp_server";
import { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { userAuth } from "./lib/auth";
import dns from "node:dns/promises";
import assert from "node:assert";
import { formatAddressPort } from "./smtp/lib/address";
import { Waitable } from "./smtp/lib/waitable";

// noinspection SpellCheckingInspection
const terminationWaitable = new Waitable();
process.on("SIGINT", terminationWaitable.set.bind(terminationWaitable, null));
process.on("SIGTERM", terminationWaitable.set.bind(terminationWaitable, null));

if (!config.development) {
    const nextConfig = readFileSync("./.next/required-server-files.json").toString("utf-8");
    const nextConfigJson = JSON.parse(nextConfig);
    process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfigJson.config);
}

// Next application
const nextApp = next({ dev: config.development, customServer: true });
const nextAppHandler = nextApp.getRequestHandler();

// Warm-up
await getDb();
await initMicrosoft();

// Start-up
await nextApp.prepare();

// Refresh all tokens. Access token lasts 1 hour, refresh token 24 hours or 90 days (unable to check the actual value).
// So refresh every 22 hours (if we check at the end of access token life, we will re-check in 22 hours, so there is
// still 24 - 1 - 22 = 1 hour to finish the refresh).
const refreshJob = startRefreshJob();

// Prepare API routes
const expressApp = express();
expressApp.enable("strict routing");
expressApp.use(routes());
expressApp.use(cors());

expressApp.use(async (req, res) => {
    const parsedUrl = parse(req.url!, true);
    await nextAppHandler(req, res, parsedUrl);
});

// Servers
const listenHosts: (string | null)[] = [];
if (config.development) {
    // Resolve localhost to IPv4 and IPv6 when available
    const localhostAddress = await dns.lookup("localhost", { all: true, order: "ipv4first" });
    assert(localhostAddress.length > 0, "No localhost address found");
    localhostAddress.forEach((address) => {
        listenHosts.push(address.address);
    });
} else {
    listenHosts.push(null);
}

// Start HTTP Server
const httpServers: Server[] = [];
const httpListenPromises: Promise<void>[] = [];
config.http.serverOptions.hosts?.forEach((host) => {
    const proto = config.http.secure ? "https" : "http";
    console.log(`> Starting ${ proto.toUpperCase() } server to listen at ${ proto }://${ host }:${ config.http.serverOptions.port } as ${
        config.development ? "development" : process.env.NODE_ENV }`);
});
config.http.serverOptions.addresses.forEach((address) => {
    let httpServer;
    if (config.http.secure) {
        httpServer = createHttpsServer(config.http.serverOptions, expressApp);
    } else {
        httpServer = createHttpServer(expressApp);
    }
    const httpListening = new Promise<void>((resolve, reject) => {
        httpServer.on("error", reject);
        httpServer.listen(config.http.serverOptions.port ?? 0, ...(address ? [address] : []), () => {
            const address = httpServer.address() as AddressInfo;
            const proto = config.http.secure ? "https" : "http";
            console.log(`> ${ proto.toUpperCase() } server listening at ${ proto }://${ formatAddressPort(address) } as ${
                config.development ? "development" : process.env.NODE_ENV
            }`);
            httpServer.off("error", reject);
            resolve();
        });
    });
    httpServers.push(httpServer);
    httpListenPromises.push(httpListening);
});

config.smtp.server.smtp?.serverOptions.hosts?.forEach((host) => {
    console.log(`> Starting SMTP server to listen at smtp://${ host }:${ config.smtp.server.smtp!.serverOptions.port }`);
});
config.smtp.server.smtpTls?.serverOptions.hosts?.forEach((host) => {
    console.log(`> Starting SMTP server to listen at smtp+tls://${ host }:${ config.smtp.server.smtpTls!.serverOptions.port }`);
});
config.smtp.server.smtpStartTls?.serverOptions.hosts?.forEach((host) => {
    console.log(`> Starting SMTP server to listen at smtp+starttls://${ host }:${ config.smtp.server.smtpStartTls!.serverOptions.port }`);
});
const smtpServer = createSmtpServer(config.smtp.interceptor, userAuth, config.smtp.server.smtp?.serverOptions, config.smtp.server.smtpTls?.serverOptions, config.smtp.server.smtpStartTls?.serverOptions);
const smtpListening = (async () => {
    await smtpServer.listen();
    if (config.smtp.server.smtp) {
        smtpServer.smtpLocalAddresses!.forEach((address) => {
            console.log(`> SMTP server listening at smtp://${ formatAddressPort(address!) }`);
        });
    }
    if (config.smtp.server.smtpTls) {
        smtpServer.smtpTlsLocalAddresses!.forEach((address) => {
            console.log(`> SMTP server listening at smtp+tls://${ formatAddressPort(address!) }`);
        });
    }
    if (config.smtp.server.smtpStartTls) {
        smtpServer.smtpStartTlsLocalAddresses!.forEach((address) => {
            console.log(`> SMTP server listening at smtp+starttls://${ formatAddressPort(address!) }`);
        });
    }
})();

const listenPromises = [...httpListenPromises, smtpListening];
try {
    // Let the first error propagate
    await Promise.all(listenPromises);

    // Wait for termination
    await terminationWaitable.promise;

    console.log("Terminating...");
} catch (err) {
    console.error(err);
    console.log("Cleaning up...");
} finally {
    // Wait for all to be settled
    await Promise.allSettled(listenPromises);
}

await refreshJob.stop();

const stopPromises = [
    nextApp.close(),
    ...httpServers.map((httpServer) => new Promise<void>((resolve, reject) => {
        if (httpServer.listening) {
            httpServer.close((err?: Error) => (err ? reject(err) : resolve()));
        } else {
            resolve();
        }
    })),
    smtpServer.close(),
];
try {
    await Promise.all(stopPromises);
} catch (err) {
    console.error(err);
} finally {
    await Promise.allSettled(stopPromises);
}

await endDb();

console.log("Terminated");
process.exit(0);
