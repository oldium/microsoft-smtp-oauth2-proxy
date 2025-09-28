import { getWebSessionUser, UnauthorizedError, webSessionFromRequest } from "@ms-smtp/common/lib/websession";
import express from "express";
import { deleteDbUser } from "@ms-smtp/common/lib/db";
import UrlActionDto from "@ms-smtp/common/dto/url_action_dto";

export default async function cancelHandler(req: express.Request, res: express.Response){
    try {
        const session = await webSessionFromRequest(req, res);

        let user;
        try {
            user = await getWebSessionUser(session);
        } finally {
            session.destroy();
        }

        await deleteDbUser(user.uid);

        res.json({ message: "Cancelled", url: "/" } satisfies UrlActionDto);
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            res.status(401).json({ message: "Unauthorized" });
        } else {
            console.error(`Error: ${(err instanceof Error && err.stack) || err}`);
            res.status(500).json({ message: "Internal Server Error" });
        }
    }
}
