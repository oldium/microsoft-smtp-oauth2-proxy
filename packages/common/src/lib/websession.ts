import { getIronSession, IronSession } from "iron-session";
import { WebSessionData } from "./state.ts";
import { getDbUser } from "./db.ts";
import { getConfig } from "./config.ts";
import { Request, Response } from "express";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies.js";

export class UnauthorizedError extends Error {
    constructor() {
        super("Unauthorized");
        this.name = "UnauthorizedError";
    }
}

export async function webSessionFromRequest(req: Request, res: Response): Promise<IronSession<WebSessionData>> {
    const config = await getConfig();
    return await getIronSession<WebSessionData>(req, res, {
        password: config.session.secret,
        cookieName: config.session.cookie,
    });
}

export async function webSessionFromCookieStore(cookies: ReadonlyRequestCookies): Promise<IronSession<WebSessionData>> {
    const config = await getConfig();
    return await getIronSession<WebSessionData>(cookies, {
        password: config.session.secret,
        cookieName: config.session.cookie,
    });
}

export async function getWebSessionUser(session: IronSession<WebSessionData>) {
    if (!session?.uid) {
        throw new UnauthorizedError();
    }
    const user = await getDbUser(session.uid);
    if (!user) {
        throw new UnauthorizedError();
    }
    return user;
}
