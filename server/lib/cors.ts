import { getUrlNoQuery } from "./request";
import cors from "cors";
import express from "express";

export function corsOptions(methods: string[], credentials: boolean): cors.CorsOptionsDelegate<express.Request> {
    return (req: express.Request, callback: (err: Error | null, options?: cors.CorsOptions) => void) => {
        const fullUrl = new URL(getUrlNoQuery(req));
        callback(null, {
            origin: fullUrl.hostname,
            methods: methods.join(","),
            credentials,
        });
    };
}
