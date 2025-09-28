export interface CancellablePromise<T> extends Promise<T> {
    cancel(): void
}

export function sleep(ms: number, onTimeout?: () => void, timeoutSet?: typeof setTimeout, timeoutClear?: typeof clearTimeout): CancellablePromise<void> {
    const { promise: sleepPromise, resolve: sleepPromiseResolve, reject: sleepPromiseReject } = Promise.withResolvers<void>();
    let timeoutId: NodeJS.Timeout | undefined;

    timeoutId = (timeoutSet ?? setTimeout).call(null, () => {
        try {
            onTimeout?.call(null);
            sleepPromiseResolve();
        } catch (err) {
            sleepPromiseReject(err);
        }
    }, ms);
    (<CancellablePromise<void>>sleepPromise).cancel = () => {
        if (timeoutId !== undefined) {
            (timeoutClear ?? clearTimeout).call(null, timeoutId);
            timeoutId = undefined;
        }
    };

    return <CancellablePromise<void>>sleepPromise;
}
