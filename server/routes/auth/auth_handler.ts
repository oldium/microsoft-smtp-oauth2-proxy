import { clearAuthorizationSession, exchangeForCredentials, getAuthorizationUrl, } from "../../lib/microsoft";
import { AuthorizationCodePayload } from "@azure/msal-node";
import _ from "lodash";
import express from "express";
import { getUrlNoQuery } from "../../lib/request";
import { getWebSession } from "../../lib/websession";
import { getDbUser, updateDbUserCredentials, User } from "../../lib/db";
import { WebSessionData } from "../../lib/state";
import { IronSession } from "iron-session";
import { EmailNotAllowed } from "../../lib/filters";
import { getCookie, setCookie } from "cookies-next/server";

export function getAuthUrl(req: express.Request): string {
    const thisUrl = getUrlNoQuery(req);
    return new URL("/auth", thisUrl).toString();
}

async function handleAuthRequest(req: express.Request, res: express.Response, session?: IronSession<WebSessionData>, user?: User, next_prompt?: string) {
    session ??= await getWebSession(req, res);
    const redirectUrl = getAuthUrl(req);
    const authUrl = await getAuthorizationUrl(redirectUrl, session, user, next_prompt);
    await session.save();

    res.redirect(307, authUrl);
}

async function handleAuthResponse(req: express.Request, res: express.Response) {
    const session = await getWebSession(req, res);
    const params = _.clone(req.query) as AuthorizationCodePayload & {
        error?: string,
        error_description?: string
    };

    const oldSession = _.clone(session);
    clearAuthorizationSession(session);

    try {
        if (params.code) {
            const { uid } = await exchangeForCredentials(
                getUrlNoQuery(req),
                params,
                oldSession
            );
            session.uid = uid;
            await session.save();
            res.redirect(303, "/configuration");
        } else if (params.error && oldSession.next_prompt) {
            // We tried silent login, but it failed. Let's try normal login
            const user = await getDbUser(session.uid);
            if (user) {
                console.info(`Silent login for user ${ user.email } failed, retrying consent...`);
                const updatedUser = await updateDbUserCredentials(user.uid, user.username, user.credentials.cache, user.credentials.expires);
                await handleAuthRequest(req, res, session, updatedUser, oldSession.next_prompt);
            } else {
                // handle error
                console.error(`Error ${ params.error }: ${ params.error_description }`);
                await session.save();
                res.redirect(307, "/");
            }
        } else {
            // handle error
            console.error(`Error ${ params.error }: ${ params.error_description }`);
            await session.save();
            res.redirect(307, "/");
        }
    } catch (err) {
        await session.save();

        if (err instanceof EmailNotAllowed) {
            const COOKIE_NAME = "show_notifications";
            const value = [];
            const existingValue = await getCookie(COOKIE_NAME, { req, res });
            try {
                if (existingValue !== undefined) {
                    const parsed = JSON.parse(existingValue);
                    if (_.isArray(parsed)) {
                        value.push(...parsed);
                    }
                }
            } catch (err) {
                console.warn(`Error reading cookie ${ COOKIE_NAME }, ignoring: ${ err }`);
            }
            value.push("Sorry, email address `" + err.email + "` is not allowed to login");
            await setCookie(COOKIE_NAME, JSON.stringify(value), { req, res });
        } else {
            // something went wrong
            console.error((err instanceof Error && err.message) || "Error handling auth response");
        }

        res.redirect(307, "/");
    }
}

export default async function authHandler(req: express.Request, res: express.Response) {
    if (req.query.code || req.query.error) {
        await handleAuthResponse(req, res);
    } else {
        await handleAuthRequest(req, res);
    }
}
