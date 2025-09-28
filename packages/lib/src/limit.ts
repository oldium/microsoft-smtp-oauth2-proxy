import pLimit from 'p-limit';


export function limitNamespace<Arguments extends unknown[], ReturnType>(
    limit: number,
    fn: (...arguments_: Arguments) => PromiseLike<ReturnType> | ReturnType
) {
    const limits: Record<
        string,
        {
            fn: (...arguments_: Arguments) => PromiseLike<ReturnType> | ReturnType;
            n: number;
        }
    > = {};
    return async (
        namespace: string,
        ...args: Arguments
    ): Promise<ReturnType> => {
        if (!limits[namespace]) {
            const limitFn = pLimit(limit);
            limits[namespace] = {
                fn: (...args: Arguments) => limitFn(fn, ...args),
                n: 0,
            };
        }
        limits[namespace].n++;
        try {
            return await limits[namespace].fn(...args);
        } finally {
            limits[namespace].n--;
            if (limits[namespace].n === 0) {
                delete limits[namespace];
            }
        }
    };
}
