import { existsSync as fsExistsSync } from "node:fs";
import fs from "node:fs/promises";
import _ from "lodash";
// noinspection SpellCheckingInspection
import djson from "dirty-json";
import yn from "yn";
import path from "node:path";
import dns from "node:dns/promises";
import { isIP } from "node:net";

export type MicrosoftAppRegistration = { id: string; secret: string };

export type Certificate = { cert: Buffer; key: Buffer } | { cert?: undefined; key?: undefined };

export type TcpServerOptions = { hosts?: string[], addresses: string[] | null[], port?: number | undefined };
export type TcpSecureServerOptions = TcpServerOptions & Certificate;

export type Http = {
    secure: boolean,
    serverOptions: TcpSecureServerOptions,
};

export type SmtpTcpServerOptions = {
    port: number,
    serverOptions: TcpServerOptions,
};

export type SmtpTcpSecureServerOptions = {
    port: number,
    serverOptions: TcpSecureServerOptions,
};

export type SmtpTimeouts = {
    clientMs: number,
}

export type SmtpInterceptorOptions = {
    target: {
        host: string,
        port: number,
        secure?: boolean,
        secured?: boolean,
    },
    timeouts: SmtpTimeouts,
    maxLineLength: number,
    greetingName: string,
};

export type SmtpServerOptions = {
    /** Hostname visible from outside and reported in the SMTP greeting */
    host: string,
    smtp?: SmtpTcpServerOptions,
    smtpTls?: SmtpTcpSecureServerOptions,
    smtpStartTls?: SmtpTcpSecureServerOptions,
}

export type SmtpOptions = {
    server: SmtpServerOptions,
    interceptor: SmtpInterceptorOptions,
};

export type Session = {
    cookie: string,
    secret: Record<string, string>,
};

export type Config = {
    apps: {
        all: Record<string, MicrosoftAppRegistration>,
        default: MicrosoftAppRegistration,
    },
    smtp: SmtpOptions,
    http: Http,
    session: Session,
    db: string,
    development: boolean
}

const development: boolean = process.env.NODE_ENV !== "production";

const appsArray: MicrosoftAppRegistration[] = process.env.APP_SECRETS!.split(",").map((app) => {
        const [id, secret] = app.split(":");
        return { id, secret };
    }
);
const allApps = _.keyBy(appsArray, "id");
const defaultAppId: string = (!_.isEmpty(process.env.DEFAULT_APP_ID)) ? process.env.DEFAULT_APP_ID! : appsArray[0].id;
const defaultApp = allApps[defaultAppId]!;
const apps = { all: allApps, default: defaultApp };

const withCertificates = !_.isEmpty(process.env.SMTP_KEY_FILE) && !_.isEmpty(process.env.SMTP_CERT_FILE);
if (withCertificates && development && !fsExistsSync(process.env.SMTP_KEY_FILE!) && !fsExistsSync(process.env.SMTP_CERT_FILE!)) {
    console.info("Generating self-signed certificate for SMTP server...");
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    // noinspection SpellCheckingInspection
    const pems = (await import("selfsigned")).generate(attrs, { keySize: 2048, days: 365 });
    await fs.mkdir(path.dirname(process.env.SMTP_KEY_FILE!), { recursive: true });
    await fs.writeFile(process.env.SMTP_KEY_FILE!, pems.private);
    await fs.writeFile(process.env.SMTP_CERT_FILE!, pems.cert);
}
const smtpCertificate: Certificate =
    withCertificates
        ? {
            key: await fs.readFile(process.env.SMTP_KEY_FILE!),
            cert: await fs.readFile(process.env.SMTP_CERT_FILE!),
        }
        : {};

const listenDefaultHosts = development ? "localhost" : null;

function formatListenHosts(hosts: string | null): string[] {
    const hostsArray = (hosts?.split(",") ?? []).map((host) => host.trim());
    return Array.from(new Set<string>(hostsArray)).filter((host) => !_.isEmpty(host) && !isIP(host));
}

async function resolveListenHosts(hosts: string | null): Promise<string[] | null[]> {
    const hostsArray = (hosts?.split(",") ?? []).map((host) => host.trim());
    const hostsAddressesArray = (await Promise.all(hostsArray.map(async (host) => {
            return (isIP(host) || _.isEmpty(host)) ? host : await dns.lookup(host, { all: true, order: "ipv4first" });
        }))).flat();
    let listenAddresses = Array.from(new Set<string>(
        hostsAddressesArray.map((address) => _.isString(address) ? address : address.address)));
    listenAddresses = listenAddresses.filter((address) => !_.isEmpty(address));
    if (listenAddresses.length == 0) {
        // @ts-expect-error catch-all network address is represented here by single null value
        listenAddresses.push(null);
    }
    return listenAddresses;
}

const smtpListenHostsString = _.isEmpty(process.env.SMTP_HOST) ? listenDefaultHosts : process.env.SMTP_HOST!;
const smtpListenHosts = formatListenHosts(smtpListenHostsString);
const smtpListenAddresses = await resolveListenHosts(smtpListenHostsString);
const smtpTcpServerOptions: { smtp?: SmtpTcpServerOptions } = process.env.SMTP_PORT ?
    {
        smtp: {
            port: parseInt(process.env.SMTP_PUBLIC_PORT ?? "465") || 465,
            serverOptions: {
                hosts: smtpListenHosts,
                addresses: smtpListenAddresses,
                port: parseInt(process.env.SMTP_PORT) || 25,
            }
        }
    } : {};
const smtpTcpTlsServerOptions: { smtpTls?: SmtpTcpSecureServerOptions } = withCertificates && process.env.SMTP_TLS_PORT ?
    {
        smtpTls: {
            port: parseInt(process.env.SMTP_PUBLIC_TLS_PORT ?? "465") || 465,
            serverOptions: {
                addresses: smtpListenAddresses,
                port: parseInt(process.env.SMTP_TLS_PORT) || 465,
                ...smtpCertificate
            }
        }
    } : {};
const smtpTcpStartTlsServerOptions: { smtpStartTls?: SmtpTcpSecureServerOptions } = withCertificates && process.env.SMTP_STARTTLS_PORT ?
    {
        smtpStartTls: {
            port: parseInt(process.env.SMTP_PUBLIC_STARTTLS_PORT ?? "587") || 587,
            serverOptions: {
                addresses: smtpListenAddresses,
                port: parseInt(process.env.SMTP_STARTTLS_PORT) || 587,
                ...smtpCertificate,
            }
        }
    } : {};
const targetPort = parseInt(process.env.SMTP_TARGET_PORT || "587") || 587;
const smtpInterceptor: { interceptor: SmtpInterceptorOptions } = {
    interceptor: {
        target: {
            host: _.isEmpty(process.env.SMTP_TARGET_HOST) ? "smtp-mail.outlook.com" : process.env.SMTP_TARGET_HOST!,
            port: parseInt(process.env.SMTP_TARGET_PORT ?? "587") || 587,
            secure: yn(process.env.SMTP_TARGET_TLS, { default: targetPort === 465 }),
        },
        timeouts: {
            clientMs: 300000,
        },
        maxLineLength: 12288,   // RFC 4954, section 4
        greetingName: _.isEmpty(process.env.SMTP_GREETING_NAME) ? process.env.SMTP_PUBLIC_HOST! : process.env.SMTP_GREETING_NAME!,
    }
};
const smtpServerOptions: { server: SmtpServerOptions } = {
    server: {
        host: process.env.SMTP_PUBLIC_HOST!,
        ...smtpTcpServerOptions,
        ...smtpTcpTlsServerOptions,
        ...smtpTcpStartTlsServerOptions,
    },
};

const smtpOptions: SmtpOptions = {
    ...smtpServerOptions,
    ...smtpInterceptor,
};

const withHttps = !_.isEmpty(process.env.HTTPS_KEY_FILE) && !_.isEmpty(process.env.HTTPS_CERT_FILE);
if (withHttps && development && !fsExistsSync(process.env.HTTPS_KEY_FILE!) && !fsExistsSync(process.env.HTTPS_CERT_FILE!)) {
    console.info("Generating self-signed certificate for HTTPS server...");
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    // noinspection SpellCheckingInspection
    const pems = (await import("selfsigned")).generate(attrs, { keySize: 2048, days: 365 });
    await fs.writeFile(process.env.HTTPS_KEY_FILE!, pems.private);
    await fs.writeFile(process.env.HTTPS_CERT_FILE!, pems.cert);
}
const httpsCertificate: Certificate =
    withHttps
        ? {
            key: await fs.readFile(process.env.HTTPS_KEY_FILE!),
            cert: await fs.readFile(process.env.HTTPS_CERT_FILE!),
        }
        : {};

const httpListenHostsString = _.isEmpty(process.env.HTTP_HOST) ? smtpListenHostsString : process.env.HTTP_HOST!;
const httpListenHosts = formatListenHosts(smtpListenHostsString);
const httpListenAddresses = (httpListenHostsString === smtpListenHostsString) ? _.clone(smtpListenAddresses) : await resolveListenHosts(httpListenHostsString);
const http: Http = {
    secure: withHttps,
    serverOptions: {
        hosts: httpListenHosts,
        addresses: httpListenAddresses,
        port: parseInt(process.env.HTTP_PORT ?? "3000") || 3000,
        ...httpsCertificate
    }
}

let sessionSecrets: string[];
const sessionSecretEnv = process.env.SESSION_SECRET!;
if (sessionSecretEnv.startsWith("[") && sessionSecretEnv.endsWith("]")) {
    sessionSecrets = djson.parse<string[]>(sessionSecretEnv);
    if (!_.isArray(sessionSecrets)) {
        console.error("Unable to parse SESSION_SECRET value array");
        process.exit(1);
    }
    if (_.isEmpty(sessionSecrets)) {
        console.error("Session secret must be provided");
        process.exit(1);
    }
} else {
    if (_.isEmpty(sessionSecretEnv)) {
        console.error("Session secret must be provided");
        process.exit(1);
    }
    sessionSecrets = [sessionSecretEnv];
}
const currentSecret = _.first(sessionSecrets);
if (!currentSecret || currentSecret.length < 32) {
    console.error("Session secret must be at least 32 characters long.");
    process.exit(1);
}

const sessionSecretMap = sessionSecrets.reduceRight<{ [key: number]: string }>((map, secret, index) => {
    map[sessionSecrets.length - index] = secret;
    return map;
}, {});

const session: Session = {
    cookie: _.isEmpty(process.env.SESSION_COOKIE) ? "session" : process.env.SESSION_COOKIE!,
    secret: sessionSecretMap,
}

const db: string = _.isEmpty(process.env.SQLITE_PATH) ? "data/db.sqlite" : process.env.SQLITE_PATH!;

const config: Config = {
    apps,
    smtp: smtpOptions,
    http,
    session,
    db,
    development,
};

export default config;
