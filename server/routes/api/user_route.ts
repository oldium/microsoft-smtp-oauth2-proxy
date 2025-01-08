import { getWebSession, getWebSessionUser, UnauthorizedError } from "../../lib/websession";
import express from "express";
import UserDto from "../../../dto/user_dto";

export default async function userHandler(req: express.Request, res: express.Response) {
    try {
        const session = await getWebSession(req, res);
        const user = await getWebSessionUser(session);

        res.json({
            email: user.email,
            smtp_password: user.smtpPassword,
        } satisfies UserDto);
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            res.status(401).json({ message: "Unauthorized" });
        } else {
            console.error(`Error: ${ (err instanceof Error && err.stack) || err }`);
            res.status(500).json({ message: "Internal Server Error" });
        }
    }
}
