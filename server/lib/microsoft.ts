import { Client } from "@microsoft/microsoft-graph-client";
import { getDbExpiredUsers, getDbUser, updateDbUserCredentials, upsertDbUser, User } from "./db.js";
import crypto, { createHash } from "node:crypto";
import { limitNamespace } from "./limit.js";
import {
    AuthError,
    AuthorizationCodePayload,
    AuthorizationCodeRequest,
    AuthorizationUrlRequest,
    ConfidentialClientApplication,
    Configuration as MSALConfiguration,
    InteractionRequiredAuthError
} from "@azure/msal-node";
import _ from "lodash";
import config from "./config.js";
import { LogLevel } from "@azure/msal-common";
import { WebSessionData } from "./state.js";
import { cryptoRandomStringAsync } from "crypto-random-string";
import { ICachePlugin } from "@azure/msal-common/node";

type MicrosoftAppRegistration = { id: string; secret: string };

export type MicrosoftOAuthCredentials = {
    cache: string,
    expires?: Date,
};

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
        beforeCacheAccess: async function(cacheContext) {
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

const msalConfigDefaults: ClientConfiguration = {
    auth: {
        clientId: "",
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
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

export async function init() {
    const res = await fetch(`${msalConfigDefaults.auth.authority}/v2.0/.well-known/openid-configuration`);
    if (!res.ok) {
        throw new Error("Failed to fetch Microsoft login endpoints.");
    }
    msalConfigDefaults.auth.authorityMetadata = await res.text();
}

export function getApp(id?: string): MicrosoftAppRegistration {
    return (id ? config.apps.all[id] : undefined) ?? config.apps.default;
}

function getMsalConfig(app: MicrosoftAppRegistration, tokens?: string): ClientConfiguration {
    const msalConfig = _.cloneDeep(msalConfigDefaults);
    msalConfig.auth.clientId = app.id;
    msalConfig.auth.clientSecret = app.secret;
    msalConfig.cache!.cachePlugin = memoryCachePlugin(tokens);
    return msalConfig;
}

async function createMsalClient(app: MicrosoftAppRegistration, tokens?: string) {
    if (!msalConfigDefaults.auth.authorityMetadata) {
        await init();
    }

    const msalConfig = getMsalConfig(app, tokens);
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
    const codeVerifier = await cryptoRandomStringAsync({length: 44, characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"});
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
    const app = getApp(user?.appId);

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
    const user = session.uid ? await getDbUser(session.uid) : undefined;
    const app = getApp(user?.appId);
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

    console.info(`User ${username} with email ${email} logged in`);

    await upsertUserCredentials(idTokenClaims.oid, username, email, credentials, app.id);

    return {uid, credentials};
}

export const getAccessToken: (user: User) => Promise<UserToken> = (function () {
    const limitedFunction = limitNamespace(
        1,
        async (user: User) => {
            const credentials = user.credentials;
            if (_.isNil(credentials.expires)) {
                throw new Error(`Expired credentials cleaned-up already`);
            }
            const app = getApp(user.appId);
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
                }
                return {
                    username: username,
                    accessToken: authResult.accessToken
                };
            } catch (err) {
                if (err instanceof InteractionRequiredAuthError) {
                    await updateUserCredentials(user.uid, user.username, {cache: ""});
                    throw new Error(`Credentials expired: ${err.message}`);
                } else if (err instanceof AuthError) {
                    await updateUserCredentials(user.uid, user.username, {cache: ""});
                    throw new Error(`Authorization error: ${err.message}`);
                } else {
                    throw err;
                }
            }
        }
    );
    return async (user: User) => limitedFunction(user.uid, user);
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

export async function refreshAllExpiredUserCredentialsJob() {
    // TODO: For more users this probably should do a batch refresh
    const expiredUsers = await getDbExpiredUsers();
    const promises = expiredUsers.map(async (user) => {
        try {
            await getAccessToken(user);
        } catch (err) {
            console.warn(`Failed to refresh credentials for ${user.email}: ${err instanceof Error && err.message || err}`);
        }
    });
    await Promise.allSettled(promises);
}

export function startRefreshJob(): { stop: () => Promise<void> } {
    const job: { id: NodeJS.Timeout | undefined, running: Promise<unknown> | false } = {
        id: undefined,
        running: false,
    };

    // Refresh all tokens on start
    process.nextTick(async () => {
        if (!job.running) {
            job.running = refreshAllExpiredUserCredentialsJob();
            await job.running;
            job.running = false;
        }
    });

    // Periodic refresh. Access token lasts 1 hour, refresh token 24 hours or 90 days (unable to check the actual value).
    // So refresh every 22 hours (if we check at the end of access token life, we will re-check in 22 hours, so there is
    // still 24 - 1 - 22 = 1 hour to finish the refresh).
    // https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens
    job.id = setInterval(async () => {
        if (!job.running) {
            job.running = refreshAllExpiredUserCredentialsJob();
            await job.running;
            job.running = false;
        }
    }, 22 * 60 * 60 * 1000);

    return {
        stop: async () => {
            if (job.id !== undefined) {
                clearInterval(job.id);
            }
            if (job.running) {
                await job.running;
            }
        }
    };
}
