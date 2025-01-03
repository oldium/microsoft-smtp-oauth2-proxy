import config from "./config";
import { Request } from "express";
import { isIP } from "node:net";
import Address from "ipaddr.js";

export function getUrlNoQuery(req: Request): string {
    let hostPort: string;
    if (req.headers["x-forwarded-host"]) {
        if (req.headers["x-forwarded-port"]) {
            hostPort = `${req.headers["x-forwarded-host"]}:${req.headers["x-forwarded-port"]}`;
        } else {
            hostPort = <string>req.headers["x-forwarded-host"]!;
        }
    } else {
        hostPort = req.headers["host"]!;
    }
    const host: string = hostPort.split(":")[0];
    const proto: string = <string>req.headers["x-forwarded-proto"] ??
        ((config.development && !config.http.secure)
        || (host === "localhost" || (isIP(host) && Address.parse(host).range() === "loopback"))
            ? "http" : "https");
    const url = new URL(`${proto}://${hostPort}${req.originalUrl}`);
    const urlNoQuery = `${url.origin}${url.pathname}`;
    return urlNoQuery;
}
