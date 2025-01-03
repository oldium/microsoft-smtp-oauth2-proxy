import isBase64 from "is-base64";

export function base64Encode(data: string, encoding: "binary" | "utf-8" = "binary"): string {
    return Buffer.from(data, encoding).toString('base64');
}

export function base64Decode(data: string, encoding: "binary" | "utf-8" = "binary"): string {
    if (isBase64(data)) {
        return Buffer.from(data, 'base64').toString(encoding);
    } else {
        throw new TypeError("Invalid base64");
    }
}
