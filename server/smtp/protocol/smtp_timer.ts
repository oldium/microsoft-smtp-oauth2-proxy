import { TypedEmitter } from "tiny-typed-emitter";

interface SmtpTimeoutEvents {
    "timeout": () => void;
}

export class SmtpTimer extends TypedEmitter<SmtpTimeoutEvents> {
    private timeoutId: NodeJS.Timeout | null = null;

    constructor() {
        super();
    }

    public start(timeout: number) {
        this.stop();
        this.timeoutId = setTimeout(() => {
            process.nextTick(() => this.emit("timeout"));
        }, timeout);
    }

    public stop() {
        if (this.timeoutId !== null) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    public close() {
        this.stop();
    }
}
