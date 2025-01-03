// noinspection JSUnusedGlobalSymbols

export * from "types/http-extensions";

import { IncomingHttpHeaders as HttpIncomingHttpHeaders } from "types/http-extensions";

declare module "types/http-extensions" {
    interface IncomingHttpHeaders extends HttpIncomingHttpHeaders {
        "x-forwarded-host"?: string | undefined;
        "x-forwarded-port"?: string | undefined;
        "x-forwarded-proto"?: string | undefined;
    }
}
