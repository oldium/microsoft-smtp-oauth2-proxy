import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Access, checkAccess } from "../../src/lib/fs.ts";

// Root and Windows ignore the permission bits
const canDeny = process.platform !== "win32" && process.getuid?.() !== 0;

describe("Tests for checkAccess", () => {
    let dir: string;
    let file: string;

    beforeAll(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), "check-access-"));
        file = path.join(dir, "file.txt");
        await fs.writeFile(file, "content");
    });

    afterAll(async () => {
        await fs.chmod(dir, 0o755);
        await fs.rm(dir, { recursive: true, force: true });
    });

    test("Accepts a readable file", async () => {
        expect(await checkAccess("Test file", file, Access.ReadOnly)).toBeUndefined();
    });

    test("Accepts a writable directory", async () => {
        expect(await checkAccess("Test directory", dir, Access.Writable)).toBeUndefined();
    });

    test("Reports a missing file with the error code", async () => {
        expect(await checkAccess("Test file", path.join(dir, "missing.txt"), Access.ReadOnly))
            .toMatch(/^Test file .*missing\.txt is not readable for .*: ENOENT$/);
    });

    (canDeny ? test : test.skip)("Reports a read-only directory with its owner and mode", async () => {
        await fs.chmod(dir, 0o555);
        try {
            expect(await checkAccess("Test directory", dir, Access.Writable))
                .toMatch(/ is not writable for UID \d+, GID \d+ \(owner \d+:\d+, mode 0555\): EACCES$/);
        } finally {
            await fs.chmod(dir, 0o755);
        }
    });
});
