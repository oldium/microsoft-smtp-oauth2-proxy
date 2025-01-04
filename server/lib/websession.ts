import { getIronSession, IronSession } from "iron-session";
import { WebSessionData } from "./state.js";
import { getDbUser } from "./db.js";
import config from "./config.js";
import { Request, Response } from "express";

export class UnauthorizedError extends Error {
    constructor() {
        super("Unauthorized");
        this.name = "UnauthorizedError";
    }
}

export async function getWebSession(req: Request, res: Response): Promise<IronSession<WebSessionData>> {
    return await getIronSession<WebSessionData>(req, res, {
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
