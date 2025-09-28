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
