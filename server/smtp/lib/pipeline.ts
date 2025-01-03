import { ConnectionClosedException } from "./exceptions";
import { Waitable } from "./waitable";
import assert from "node:assert";
import { TypedEmitter } from "tiny-typed-emitter";

export type Handler = () => Promise<void> | void;

interface PipelineEvents {
    "empty": () => void;
}

export class Pipeline extends TypedEmitter<PipelineEvents> {
    private pipelineReady: (() => void) | null = null;
    private readonly pipeline: Handler[] = [];
    private readonly closed = new Waitable(null);
    private readonly finished = new Waitable();

    constructor() {
        super();
    }

    public async close(err?: unknown): Promise<void> {
        this.closed.set(err);
        await this.finished.promise;
    }

    public async loop() {
        try {
            while (true) {
                if (this.pipeline.length === 0) {
                    // Emit on next tick to allow adding new handlers during the
                    // same cycle. This covers initial setup
                    process.nextTick(() => {
                        // Only emit when really empty
                        if (this.pipeline.length === 0) {
                            this.emit("empty");
                        }
                    });

                    let queueReadyPromise;
                    ({ promise: queueReadyPromise, resolve: this.pipelineReady } = Promise.withResolvers<void>());
                    const closed = await Promise.race([queueReadyPromise, this.closed.promise]);
                    if (closed === null) {
                        break;
                    }
                } else {
                    const command = this.pipeline[0];
                    try {
                        await command();
                    } finally {
                        // Remove from the queue after the handling finishes to allow
                        // flushing all writes in-order
                        this.pipeline.shift();
                    }

                }
            }

            assert(this.pipeline.length === 0, "Pipeline not empty");
        } finally {
            this.finished.set();
        }
    }

    public async waitEmpty() {
        if (this.closed.done) {
            // Propagate closed error
            await this.closed.promise;
            if (this.pipeline.length !== 0) {
                throw new ConnectionClosedException("Connection closed with non-empty pipeline");
            }
            return;
        }
        if (this.pipeline.length !== 0) {
            const { promise: emptyPromise, resolve: emptyResolve } = Promise.withResolvers<void>();
            this.once("empty", emptyResolve);
            const closed = await Promise.race([emptyPromise, this.closed.promise]);
            if (closed === null) {
                this.off("empty", emptyResolve);
                throw new ConnectionClosedException("Connection closed");
            }
        }
    }

    public add(handler: Handler) {
        if (this.finished.done) {
            throw new ConnectionClosedException("Pipeline closed");
        }

        this.pipeline.push(handler);
        this.pipelineReady?.call(null);
        this.pipelineReady = null;
    }

}
