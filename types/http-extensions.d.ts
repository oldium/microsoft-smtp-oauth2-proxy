// noinspection JSUnusedGlobalSymbols

export * from "http";

import { IncomingHttpHeaders as HttpIncomingHttpHeaders } from "http";

declare module "http" {
    interface IncomingHttpHeaders extends HttpIncomingHttpHeaders {
        "x-forwarded-host"?: string | undefined;
        "x-forwarded-port"?: string | undefined;
        "x-forwarded-proto"?: string | undefined;
        "x-forwarded-path"?: string | undefined;
    }
}
