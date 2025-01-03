export * from "smtp-server";

import { SMTPServer as OriginalSMTPServer } from "smtp-server";

declare module "smtp-server" {
    interface SMTPServer extends OriginalSMTPServer {
        emit(event: "closed"): boolean;
        on(event: "closed", listener: () => void): this;
        once(event: "closed", listener: () => void): this;
        off(event: "closed", listener: () => void): this;
    }
}
