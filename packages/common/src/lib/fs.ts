import { constants, type Stats } from "node:fs";
import fs from "node:fs/promises";
import { default as fsPath } from "node:path";

export function resolvePath(root: string | null, path: string): string;
export function resolvePath(root: string | null, path: undefined): undefined;
export function resolvePath(root: string | null, path: string | undefined): string | undefined;
export function resolvePath(root: string | null, path: string | undefined) {
    if (!!path) {
        return (fsPath.isAbsolute(path) || !root) ? path : fsPath.join(root, path);
    } else {
        return path;
    }
}

export const Access = {
    ReadOnly: 0,
    Writable: 1,
} as const;
export type Access = typeof Access[keyof typeof Access];

/** Returns why the process cannot access the path, undefined when it can */
export async function checkAccess(name: string, path: string, access: Access): Promise<string | undefined> {
    const absolutePath = fsPath.resolve(path);
    const writable = access === Access.Writable;
    let stats: Stats | undefined;
    try {
        stats = await fs.stat(absolutePath);
        await fs.access(absolutePath,
            constants.R_OK | (writable ? constants.W_OK : 0) | (stats.isDirectory() ? constants.X_OK : 0));
        return undefined;
    } catch (err) {
        const identity = process.getuid && process.getgid
            ? `UID ${ process.getuid() }, GID ${ process.getgid() }`
            : "the current user";
        const owner = stats
            ? ` (owner ${ stats.uid }:${ stats.gid }, mode ${ (stats.mode & 0o7777).toString(8).padStart(4, "0") })`
            : "";
        const reason = (err as NodeJS.ErrnoException).code ?? String(err);
        return `${ name } ${ absolutePath } is not ${ writable ? "writable" : "readable" } for ${ identity }${ owner }: ${ reason }`;
    }
}

// Ownership mismatches of mounted volumes are the usual start-up failure, so report owner and mode
export async function requireAccess(name: string, path: string, access: Access): Promise<void> {
    const error = await checkAccess(name, path, access);
    if (error) {
        console.error(error);
        process.exit(1);
    }
}
