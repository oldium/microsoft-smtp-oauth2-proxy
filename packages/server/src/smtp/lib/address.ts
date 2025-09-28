import { AddressInfo } from "node:net";

export function formatAddress(address: AddressInfo): string {
    // Format IPv4 as-is, IPv6 in square brackets
    return address.family === "IPv4" ? address.address : `[${ address.address }]`;
}

export function formatAddressPort(address: AddressInfo): string {
    return `${ formatAddress(address) }:${ address.port }`;
}
