import { getWebSessionUser, UnauthorizedError, webSessionFromRequest } from "@ms-smtp/common/lib/websession";
import type express from "express";
import { deleteDbUser } from "@ms-smtp/common/lib/db";
import type UrlActionDto from "@ms-smtp/common/dto/url_action_dto";
import { showNotification } from "@ms-smtp/common/lib/cookies";

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

        await showNotification("success", "Your account has been cancelled", { req, res });
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
