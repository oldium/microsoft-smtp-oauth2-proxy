import { getWebSession, getWebSessionUser, UnauthorizedError } from "../../lib/websession";
import config from "../../lib/config";
import express from "express";
import UserDto from "../../../dto/user_dto";

export function getConnectionDetails(): Pick<UserDto, "smtp_host" | "smtp_ports"> {
    const ports = [];
    if (config.smtp.server.smtp) {
        ports.push({port: config.smtp.server.smtp.port, security: "TLS"});
    }
    if (config.smtp.server.smtpTls && config.smtp.server.smtpTls.port !== config.smtp.server.smtp?.port) {
        ports.push({port: config.smtp.server.smtpTls.port, security: "TLS"});
    }
    if (config.smtp.server.smtpStartTls) {
        ports.push({port: config.smtp.server.smtpStartTls.port, security: "STARTTLS"});
    }

    return {
        smtp_host: config.smtp.server.host,
        smtp_ports: ports,
    };
}

export default async function userHandler(req: express.Request, res: express.Response) {
    try {
        const session = await getWebSession(req, res);
        const user = await getWebSessionUser(session);

        res.json({
            email: user.email,
            smtp_password: user.smtpPassword,
            ...getConnectionDetails(),
        } as UserDto);
    } catch (err) {
        if (err instanceof UnauthorizedError) {
            res.status(401).json({ message: "Unauthorized" });
        } else {
            console.error(`Error: ${(err instanceof Error && err.stack) || err}`);
            res.status(500).json({ message: "Internal Server Error" });
        }
    }
}
