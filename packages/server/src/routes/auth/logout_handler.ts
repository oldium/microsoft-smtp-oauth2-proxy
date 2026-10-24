import type express from "express";
import { UnauthorizedError, webSessionFromRequest } from "@ms-smtp/common/lib/websession";
import type UrlActionDto from "@ms-smtp/common/dto/url_action_dto";
import { showNotification } from "@ms-smtp/common/lib/cookies";

export default async function logoutHandler(req: express.Request, res: express.Response) {
    try {
        const session = await webSessionFromRequest(req, res);
        const uid = session.uid;
        session.destroy();

        if (uid) {
            await showNotification("info", "You have been signed out", { req, res });
            res.json({ message: "Logged-out", url: "/" } satisfies UrlActionDto);
        } else {
            res.status(401).json({ message: "Unauthorized" });
        }
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            res.status(401).json({ message: "Unauthorized" });
        } else {
            console.error(`Error: ${ (err instanceof Error && err.stack) || err }`);
            res.status(500).json({ message: "Internal Server Error" });
        }
    }
};
