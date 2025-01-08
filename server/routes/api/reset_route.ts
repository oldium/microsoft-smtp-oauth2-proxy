import { updateDbUserSmtpPassword } from "../../lib/db";
import crypto from "node:crypto";
import { getWebSession, getWebSessionUser, UnauthorizedError } from "../../lib/websession";
import express from "express";
import UserDto from "../../../dto/user_dto";

export default async function resetHandler(req: express.Request, res: express.Response) {
    try {
        const session = await getWebSession(req, res);
        const user = await getWebSessionUser(session);
        const updatedUser = await updateDbUserSmtpPassword(
            user.uid,
            user.email,
            crypto.randomBytes(16).toString("hex")
        );
        if (updatedUser) {
            res.json({
                email: updatedUser.email,
                smtp_password: updatedUser.smtpPassword,
            } satisfies UserDto);
        } else {
            res.status(500).json({ message: 'Internal Server Error' });
        }
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            res.status(401).json({ message: 'Unauthorized' });
        } else {
            console.error(`Error: ${ (err instanceof Error && err.stack) || err }`);
            res.status(500).json({ message: 'Internal Server Error' });
        }
    }
}
