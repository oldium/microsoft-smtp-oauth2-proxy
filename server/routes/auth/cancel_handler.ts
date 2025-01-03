import { getWebSession, getWebSessionUser, UnauthorizedError } from "../../lib/websession";
import express from "express";
import { deleteDbUser } from "../../lib/db";
import UrlActionDto from "../../../dto/url_action_dto";

export default async function cancelHandler(req: express.Request, res: express.Response){
    try {
        const session = await getWebSession(req, res);

        let user;
        try {
            user = await getWebSessionUser(session);
        } finally {
            session.destroy();
        }

        await deleteDbUser(user.uid);

        res.json({ message: "Cancelled", url: "/" } as UrlActionDto);
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            res.status(401).json({ message: "Unauthorized" });
        } else {
            console.error(`Error: ${(err instanceof Error && err.stack) || err}`);
            res.status(500).json({ message: "Internal Server Error" });
        }
    }
}
