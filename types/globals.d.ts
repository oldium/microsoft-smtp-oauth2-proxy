import { type Database } from "@ms-smtp/common/lib/db.ts";

declare interface Error {
  name: string
  message: string
  stack?: string
  code?: number | string
}

declare global {
    // noinspection ES6ConvertVarToLetConst
    var __db__: Database | undefined;
}
