declare module "proxy-addr" {
    declare function proxyAddr(
        req: IncomingMessage,
        trust: proxyAddr.Address | proxyAddr.Address[] | ((addr: string, i: number) => boolean) |
            ((addr: string) => boolean)
    ): string;

    declare namespace proxyAddr {
        function all(req: IncomingMessage,
            trust?: Address | Address[] | ((addr: string, i: number) => boolean) |
                ((addr: string) => boolean)): string[];

        function compile(val: Address | Address[]): (addr: string) => boolean;
    }

    export = proxyAddr;
}
