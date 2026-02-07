import "localenv";
import { createServer as createHttpServer, Server } from "http";
import { createServer as createHttpsServer } from "https";
import next from "next";
import { getConfig, type TcpServerOptions } from "@ms-smtp/common/lib/config";
import { endDb, getDb } from "@ms-smtp/common/lib/db";
import { init as initMicrosoft, startRefreshJob } from "@ms-smtp/lib/microsoft";
import express from "express";
import routes from "@ms-smtp/server/routes/index";
import { parse } from "node:url";
import { createServer as createSmtpServer } from "@ms-smtp/server/smtp/smtp_server";
import { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { userAuth } from "@ms-smtp/lib/auth";
import { formatAddressPort } from "@ms-smtp/server/smtp/lib/address";
import { Waitable } from "@ms-smtp/server/smtp/lib/waitable";
import { refreshFilters } from "@ms-smtp/common/lib/filters";
import { closeIdleConnections, traceConnections } from "@ms-smtp/lib/shutdown";

const config = await getConfig();

// noinspection SpellCheckingInspection
const terminationWaitable = new Waitable();
process.on("SIGINT", terminationWaitable.set.bind(terminationWaitable, null));
process.on("SIGTERM", terminationWaitable.set.bind(terminationWaitable, null));
process.on("SIGHUP", refreshFilters);

if (!config.development) {
    const nextConfig = readFileSync(".next/required-server-files.json").toString("utf-8");
    const nextConfigJson = JSON.parse(nextConfig);
    process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfigJson.config);
}

// Next application
const nextApp = next({ dev: config.development });
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

expressApp.use(async (req, res) => {
    const parsedUrl = parse(req.url!, true);
    await nextAppHandler(req, res, parsedUrl);
});

// Start HTTP Servers
function printStartHttpListening(proto: string, serverOptions?: TcpServerOptions) {
    serverOptions?.hosts?.forEach((host) => {
        serverOptions.ports?.forEach((port) => {
            console.log(`> Starting ${ proto.toUpperCase() } server to listen at ${ proto }://${ host }:${ port } as ${
                config.development ? "development" : process.env.NODE_ENV }`);
        });
    });
}

const httpServers: Server[] = [];
const httpListenPromises: Promise<void>[] = [];
printStartHttpListening(config.http.secure ? "https" : "http", config.http.serverOptions);
config.http.serverOptions.addresses.forEach((address) => {
    config.http.serverOptions.ports?.forEach((port) => {
        let httpServer;
        if (config.http.secure) {
            httpServer = createHttpsServer(config.http.serverOptions, expressApp);
        } else {
            httpServer = createHttpServer(expressApp);
        }
        traceConnections(httpServer);

        const httpListening = new Promise<void>((resolve, reject) => {
            httpServer.on("error", reject);
            httpServer.listen(port, ...(address ? [address] : []), () => {
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
});

// Start SMTP Servers
function printStartSmtpListening(proto: string, serverOptions?: TcpServerOptions) {
    serverOptions?.hosts?.forEach((host) => {
        serverOptions.ports?.forEach((port) => {
            console.log(`> Starting SMTP server to listen at ${ proto }://${ host }:${ port }`);
        });
    });
}

function printSmtpListening(proto: string, localAddresses?: (AddressInfo | undefined)[] | undefined) {
    localAddresses?.forEach((address) => {
        console.log(`> SMTP server listening at ${ proto }://${ formatAddressPort(address!) }`);
    });
}

printStartSmtpListening("smtp", config.smtp.server.smtp?.serverOptions);
printStartSmtpListening("smtp+tls", config.smtp.server.smtpTls?.serverOptions);
printStartSmtpListening("smtp+starttls", config.smtp.server.smtpStartTls?.serverOptions);
// noinspection SpellCheckingInspection
printStartSmtpListening("smtp+autotls", config.smtp.server.smtpAutoTls?.serverOptions);

const smtpServer = createSmtpServer(config.smtp.interceptor, userAuth,
    config.smtp.server.smtp?.serverOptions, config.smtp.server.smtpTls?.serverOptions,
    config.smtp.server.smtpStartTls?.serverOptions, config.smtp.server.smtpAutoTls?.serverOptions);
const smtpListening = (async () => {
    await smtpServer.listen();
    printSmtpListening("smtp", smtpServer.smtpLocalAddresses);
    printSmtpListening("smtp+tls", smtpServer.smtpTlsLocalAddresses);
    printSmtpListening("smtp+starttls", smtpServer.smtpStartTlsLocalAddresses);
    // noinspection SpellCheckingInspection
    printSmtpListening("smtp+autotls", smtpServer.smtpAutoTlsLocalAddresses);
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

// Stop refresh job and all servers
const stopPromises = [
    refreshJob.stop(),
    smtpServer.close(),
    ...httpServers.map((httpServer) => new Promise<void>((resolve, reject) => {
        if (httpServer.listening) {
            httpServer.close((err?: Error) => (err ? reject(err) : resolve()));
        } else {
            resolve();
        }
    })),
];

// Start closing all idle connections
closeIdleConnections();

try {
    await Promise.all(stopPromises);
} catch (err) {
    console.error(err);
} finally {
    await Promise.allSettled(stopPromises);
}

// Stop Next.js application
try {
    await nextApp.close();
} catch (err) {
    console.error(err);
}

// Close the database
await endDb();

console.log("Terminated");
process.exit(0);
