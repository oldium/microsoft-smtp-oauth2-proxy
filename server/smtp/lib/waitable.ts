// noinspection SpellCheckingInspection
export class Waitable<T = void> {

    public readonly promise: Promise<T>;
    public readonly set: (err?: unknown) => void;
    private _done: boolean = false;

    constructor(doneValue?: T) {
        const { promise, resolve, reject } = Promise.withResolvers<T>();

        this.promise = promise;

        // Avoid unhandled exceptions
        this.promise.catch(() => {});

        this.set = (err?: unknown) => {
            this._done = true;
            if (err) {
                reject(err);
            } else {
                if (doneValue === undefined) {
                    // @ts-expect-error doneValue is undefined
                    resolve();
                } else {
                    resolve(doneValue);
                }
            }
        }
    }

    public get done(): boolean {
        return this._done;
    }
}
