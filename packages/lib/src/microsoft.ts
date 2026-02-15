import { Client } from "@microsoft/microsoft-graph-client";
import {
    clearAllDbRetryFlags,
    getDbExpiredUsers,
    getDbRetryUsers,
    getDbUser,
    markDbUserDoRetry,
    markDbUserStopRetry,
    type MicrosoftOAuthCredentials,
    updateDbUserCredentials,
    upsertDbUser,
    User
} from "@ms-smtp/common/lib/db";
import crypto, { createHash } from "node:crypto";
import { limitNamespace } from "./limit.ts";
import {
    AuthError,
    AuthorizationCodePayload,
    AuthorizationCodeRequest,
    AuthorizationUrlRequest,
    ClientAuthErrorCodes,
    ConfidentialClientApplication,
    Configuration as MSALConfiguration,
    InteractionRequiredAuthError
} from "@azure/msal-node";
import _ from "lodash";
import { LogLevel } from "@azure/msal-common";
import { WebSessionData } from "@ms-smtp/common/lib/state";
import { cryptoRandomStringAsync } from "crypto-random-string";
import { ICachePlugin } from "@azure/msal-common/node";
import { applyFilters } from "@ms-smtp/common/lib/filters";
import assert from "node:assert";
import { getConfig } from "@ms-smtp/common/lib/config";

type MicrosoftAppRegistration = { id: string; secret: string };

export type UserToken = { username: string, accessToken: string };

// https://learn.microsoft.com/en-us/graph/auth-v2-user?tabs=curl
// https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/quickStartType~/null/sourceType/Microsoft_AAD_IAM/appId/770fcbe8-e94c-41ed-a7c9-9f05d41aca9d/objectId/6ec2e516-d2bb-4e4d-af38-99cf6f90b6f0/isMSAApp~/false/defaultBlade/Overview/appSignInAudience/PersonalMicrosoftAccount
// support multiple app registrations
// Scopes - see https://github.com/jstedfast/MailKit/blob/master/ExchangeOAuth2.md
const SCOPES = ["email", "https://outlook.office.com/SMTP.Send"];
const CLAIMS = {};
const TENANT_ID = "consumers";

type MemoryCachePlugin = ICachePlugin & { cache: string, cacheChanged: boolean };
type ClientConfiguration = MSALConfiguration & { cache?: { cachePlugin?: MemoryCachePlugin } };

export class NetworkError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "NetworkError";
    }
}

// noinspection JSUnusedLocalSymbols
function consoleLogger(level: LogLevel, message: string) {
    switch (level) {
        case LogLevel.Error:
            console.error(message);
            return;
        case LogLevel.Info:
            console.info(message);
            return;
        case LogLevel.Verbose:
            console.debug(message);
            return;
        case LogLevel.Warning:
            console.warn(message);
            return;
        default:
            console.log(message);
            return;
    }
}

function memoryCachePlugin(tokens?: string): MemoryCachePlugin {
    return {
        cache: tokens || "",
        cacheChanged: false,
        beforeCacheAccess: async function (cacheContext) {
            cacheContext.tokenCache.deserialize(this.cache);
        },
        afterCacheAccess: async function (cacheContext) {
            if (cacheContext.cacheHasChanged) {
                this.cache = cacheContext.tokenCache.serialize();
                this.cacheChanged = true;
            }
        },
    };
}

let msalConfigDefaults: ClientConfiguration | undefined = undefined;

export async function init() {
    assert(msalConfigDefaults === undefined);

    const config = await getConfig();
    msalConfigDefaults = {
        auth: {
            clientId: "",
            authority: `https://login.microsoftonline.com/${ TENANT_ID }`,
        },
        cache: {},
        system: {
            loggerOptions: {
                loggerCallback: consoleLogger,
                piiLoggingEnabled: config.development,
                logLevel: config.development ? LogLevel.Verbose : LogLevel.Info,
            },
        },
    };

    const res = await fetch(`${ msalConfigDefaults.auth.authority }/v2.0/.well-known/openid-configuration`);
    if (!res.ok) {
        throw new Error("Failed to fetch Microsoft login endpoints.");
    }
    msalConfigDefaults.auth.authorityMetadata = await res.text();
}

export async function getApp(id?: string): Promise<MicrosoftAppRegistration> {
    const config = await getConfig();
    return (id ? config.apps.all[id] : undefined) ?? config.apps.default;
}

async function getMsalConfig(app: MicrosoftAppRegistration, tokens?: string): Promise<ClientConfiguration> {
    if (msalConfigDefaults === undefined) {
        await init();
    }
    const msalConfig = _.cloneDeep(msalConfigDefaults!);
    msalConfig.auth.clientId = app.id;
    msalConfig.auth.clientSecret = app.secret;
    msalConfig.cache!.cachePlugin = memoryCachePlugin(tokens);
    return msalConfig;
}

async function createMsalClient(app: MicrosoftAppRegistration, tokens?: string) {
    const msalConfig = await getMsalConfig(app, tokens);
    return {
        client: new ConfidentialClientApplication(msalConfig),
        cache: () => {
            return {
                cache: msalConfig.cache!.cachePlugin!.cache,
                cacheChanged: msalConfig.cache!.cachePlugin!.cacheChanged
            };
        }
    };
}

export function clearAuthorizationSession(session: WebSessionData) {
    delete session.codeVerifier;
    delete session.state;
    delete session.nonce;
    delete session.next_prompt;
}

export async function getAuthorizationUrl(redirectUri: string,
                                          session: WebSessionData,
                                          user: User | undefined,
                                          next_prompt: string | undefined): Promise<string> {

    // noinspection SpellCheckingInspection
    const codeVerifier = await cryptoRandomStringAsync({
        length: 44,
        characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    });
    const codeChallenge = createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
    const state = crypto.randomBytes(16).toString("hex");
    const nonce = crypto.randomBytes(16).toString("hex");

    session.codeVerifier = codeVerifier;
    session.state = state;
    session.nonce = nonce;
    delete session.next_prompt;

    if (session.uid) {
        user ??= await getDbUser(session.uid);
    }
    const app = await getApp(user?.appId);

    let loginHint;
    const prompt = next_prompt ?? (user?.username ? "none" : "select_account");
    if (prompt == "none") {
        // Try silent login
        loginHint = user?.username;
        session.next_prompt = "select_account";
    }

    const { client: msalClient } = await createMsalClient(app);
    const authCodeUrlParameters: AuthorizationUrlRequest = {
        scopes: SCOPES,
        claims: JSON.stringify(CLAIMS),
        redirectUri,
        codeChallenge,
        loginHint,
        codeChallengeMethod: "S256",
        state,
        nonce,
        prompt
    };

    return await msalClient.getAuthCodeUrl(authCodeUrlParameters);
}

async function getEmail(accessToken: string): Promise<string> {
    const client = getMicrosoftGraphClient(accessToken);
    const { userPrincipalName: email } = await client.api("/me").get();
    return email as string;
}

export async function exchangeForCredentials(
    redirectUri: string,
    response: AuthorizationCodePayload,
    session: WebSessionData,
) {
    const config = await getConfig();

    const user = session.uid ? await getDbUser(session.uid) : undefined;
    const app = await getApp(user?.appId);
    const { client: msalClient, cache: cacheGetter } = await createMsalClient(app);
    const authCodeRequestParameters: AuthorizationCodeRequest = {
        scopes: SCOPES,
        claims: JSON.stringify(CLAIMS),
        redirectUri,
        code: response.code,
        codeVerifier: session.codeVerifier!,
        state: session.state!
    }

    const authCodePayload = _.cloneDeep(response);
    authCodePayload.nonce = session.nonce!;

    const authResult = await msalClient.acquireTokenByCode(authCodeRequestParameters, authCodePayload);
    const { cache } = cacheGetter();
    const credentials: MicrosoftOAuthCredentials = {
        cache: cache,
        expires: authResult.expiresOn!,
    };
    const idTokenClaims = authResult.idTokenClaims as { oid: string, email?: string };
    const uid = idTokenClaims.oid;
    const email = idTokenClaims.email ?? await getEmail(authResult.accessToken);
    const username = authResult.account!.username!;

    if (user === undefined) {
        // New user - check if the email is allowed. Throws if not
        applyFilters(email, config.filters);
    }

    console.info(`User ${ username } with email ${ email } logged in`);

    await upsertUserCredentials(idTokenClaims.oid, username, email, credentials, app.id);

    return { uid, credentials };
}

export const getAccessToken: (user: User, retrying?: boolean) => Promise<UserToken> = (function () {
    const limitedFunction = limitNamespace(
        1,
        async (user: User, retrying: boolean | unknown) => {
            const credentials = user.credentials;
            if (_.isNil(credentials.expires)) {
                throw new Error(`Expired credentials cleaned-up already`);
            }
            const app = await getApp(user.appId);
            const { client: msalClient, cache: cacheGetter } = await createMsalClient(app, credentials.cache);
            const accounts = await msalClient.getTokenCache().getAllAccounts();
            if (accounts.length === 0) {
                throw new Error(`No account found`);
            }
            const account = accounts[0];
            const silentRequest = {
                account: account,
                scopes: SCOPES,
                claims: JSON.stringify(CLAIMS),
                forceRefresh: (credentials.expires < new Date()),
            };
            try {
                const authResult = await msalClient.acquireTokenSilent(silentRequest);
                const username = authResult.account!.username!;
                const { cache, cacheChanged } = cacheGetter();
                if (cacheChanged) {
                    credentials.cache = cache;
                    credentials.expires = authResult.expiresOn!;
                    await updateUserCredentials(user.uid, username, credentials);
                } else if (retrying) {
                    await markDbUserStopRetry(user.uid);
                }
                return {
                    username: username,
                    accessToken: authResult.accessToken
                };
            } catch (err) {
                if (err instanceof InteractionRequiredAuthError) {
                    await updateUserCredentials(user.uid, user.username, { cache: "" });
                    throw new Error(`Credentials expired: ${ err.message }`);
                } else if (err instanceof AuthError) {
                    if (err.errorCode === ClientAuthErrorCodes.networkError) {
                        await markDbUserDoRetry(user.uid);
                        throw new NetworkError(`Authorization error (network): ${ err.message }`, { cause: err });
                    } else {
                        await updateUserCredentials(user.uid, user.username, { cache: "" });
                        throw new Error(`Authorization error: ${ err.message }`);
                    }
                } else {
                    throw err;
                }
            }
        }
    );
    return async (user: User, retrying?: boolean) => limitedFunction(user.uid, user, retrying);
})();

export async function updateUserCredentials(
    uid: string,
    username: string,
    credentials: MicrosoftOAuthCredentials,
) {
    await updateDbUserCredentials(uid, username, credentials.cache, credentials.expires);
}

export async function upsertUserCredentials(
    uid: string,
    username: string,
    email: string,
    credentials: MicrosoftOAuthCredentials,
    appId: string
) {
    await upsertDbUser(uid, username, email, crypto.randomBytes(16).toString("hex"), appId, credentials.cache, credentials.expires!);
}

export function getMicrosoftGraphClient(accessToken: string) {
    return Client.init({
        authProvider: async (done) => {
            done(null, accessToken);
        },
    });
}

export async function refreshUserCredentials(users: User[], retrying?: boolean) {
    let needRetry = false;
    const promises = users.map(async (user) => {
        try {
            await getAccessToken(user, retrying);
        } catch (err) {
            if (err instanceof NetworkError) {
                console.info(`Unsuccessful refreshing of credentials for ${ user.email }, will retry in 10 minutes due to error: ${ err.message }`);
                needRetry = true;
            } else {
                console.warn(`Failed to retry refresh credentials for ${ user.email }: ${ (err instanceof Error && err.message) || err }`);
            }
        }
    });
    await Promise.allSettled(promises);
    return needRetry;
}

function prepareRetryRefreshJob() {
    const job: {
        id: NodeJS.Timeout | undefined,
        running: Promise<unknown> | false,
        runAgain: boolean,
        stopped: boolean,
    } = {
        id: undefined,
        running: false,
        runAgain: false,
        stopped: false,
    };

    async function refresh() {
        if (!job.running) {
            const { promise, resolve: finished } = Promise.withResolvers<void>();
            job.running = promise;
            job.runAgain = false;
            try {
                const users = await getDbRetryUsers();
                if (users.length > 0) {
                    const runAgain = await refreshUserCredentials(users, true);
                    job.runAgain ||= runAgain;
                }
            } catch (err) {
                console.error(`Failed to refresh credentials: ${ (err instanceof Error && err.message) || err }`);
            }
            if (job.runAgain) {
                job.runAgain = false;
            } else {
                clearInterval(job.id);
                job.id = undefined;
            }
            job.running = false;
            finished();
        }
    }

    return {
        stop: async () => {
            job.stopped = true;
            if (job.id !== undefined) {
                clearInterval(job.id);
                job.id = undefined;
            }
            if (job.running) {
                await job.running;
            }
        },
        restart: () => {
            if (!job.stopped) {
                 if (job.id === undefined) {
                     job.id = setInterval(refresh.bind(null), 10 * 60 * 1000);
                 } else {
                     job.runAgain = true;
                 }
            }
        }
    };
}

export function startMainRefreshJob(): { stop: () => Promise<void> } {
    const job: {
        id: NodeJS.Timeout | undefined,
        running: Promise<unknown> | false,
        initial: boolean,
    } = {
        id: undefined,
        running: false,
        initial: true,
    };

    const retry = prepareRetryRefreshJob();

    async function refresh() {
        if (job.running === false) {
            const { promise, resolve: finished } = Promise.withResolvers<void>();
            job.running = promise;

            let needRetry = false;
            try {
                if (job.initial) {
                    await clearAllDbRetryFlags();
                    job.initial = false;
                }
                const expiredUsers = await getDbExpiredUsers();
                needRetry = await refreshUserCredentials(expiredUsers);
            } catch (err) {
                console.error(`Failed to refresh credentials: ${ (err instanceof Error && err.message) || err }`);
            }
            if (needRetry) {
                retry.restart();
            }
            job.running = false;
            finished();
        }
    }

    // Refresh all tokens on start
    process.nextTick(refresh.bind(null));

    // Periodic refresh. Access token lasts 1 hour, refresh token assumed 24 hours.
    // So refresh every 21 hours (24 - 1 - 2 = 21 hours with 2 hours reserve for retries).
    // https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
    job.id = setInterval(refresh.bind(null), 21 * 60 * 60 * 1000);

    return {
        stop: async () => {
            const retryStop = retry.stop();
            if (job.id !== undefined) {
                clearInterval(job.id);
                job.id = undefined;
            }
            await Promise.allSettled([ retryStop, job.running ]);
        }
    };
}
