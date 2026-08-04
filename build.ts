import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert";
import fsExtra from "fs-extra";
import { execSync } from "node:child_process";

await fs.mkdir('dist', { recursive: true });

// Build all modules
execSync('npm run build', { stdio: 'inherit' });
execSync('npm run pack', { stdio: 'inherit' });

const nextRoot = 'packages/ui';

await fs.mkdir('build', { recursive: true });
const nextFiles = await fs.readdir(nextRoot);
for (const file of nextFiles) {
    if (![".next", "node_modules"].includes(file)) {
        await fs.cp(`${ nextRoot }/${ file }`, `build/${ file }`, {
            preserveTimestamps: true,
            force: true,
            recursive: true
        });
    }
}
type LockEntry = {
    link?: boolean;
    resolved?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

// TEMPORARY until typescript-eslint accepts TypeScript 7 and the root TypeScript 6 alias goes away.
// Drops the root-only ESLint packages, whose TypeScript 6 peers npm would check against the UI's TypeScript 7.
function pruneLock(packages: Record<string, LockEntry>, root: string) {
    const reachable = new Set<string>();

    const resolve = (from: string, name: string) => {
        for (let dir = from; ; dir = dir.slice(0, Math.max(dir.lastIndexOf("/node_modules/"), 0))) {
            const candidate = `${ dir ? `${ dir }/` : "" }node_modules/${ name }`;
            if (candidate in packages) {
                return candidate;
            }
            if (!dir) {
                return undefined;
            }
        }
    };

    const visit = (path: string) => {
        if (reachable.has(path)) {
            return;
        }
        reachable.add(path);
        const entry = packages[path];
        if (entry.link) {
            visit(entry.resolved!);
            return;
        }
        const peers = Object.keys(entry.peerDependencies ?? {})
            .filter((name) => !entry.peerDependenciesMeta?.[name]?.optional);
        const names = [
            ...Object.keys(entry.dependencies ?? {}),
            ...Object.keys(entry.optionalDependencies ?? {}),
            ...peers,
            ...(path === root ? Object.keys(entry.devDependencies ?? {}) : []),
        ];
        for (const name of names) {
            const found = resolve(path, name);
            if (found) {
                visit(found);
            }
        }
    };
    visit(root);

    const relocated = (path: string) => path === root ? "" :
        path.startsWith(`${ root }/`) ? path.slice(root.length + 1) : path;
    const movedPaths = [...reachable].filter((path) => path.startsWith(`${ root }/`)).map(relocated);
    const shadowed = (path: string) => !path.startsWith(`${ root }/`) &&
        movedPaths.some((moved) => path === moved || path.startsWith(`${ moved }/`));

    return Object.fromEntries([...reachable]
        .filter((path) => !shadowed(path))
        .map((path) => [relocated(path), packages[path]]));
}

const lock = JSON.parse(await fs.readFile("package-lock.json", "utf-8"));
lock.packages = pruneLock(lock.packages, nextRoot);
await fs.writeFile("build/package-lock.json", JSON.stringify(lock, null, 2) + "\n");

// Update build/package.json to replace "@ms-smtp/*":"<version>" with "@ms-smtp/*":"file:../ms-smtp-*-<version>.tgz"
const packageJsonPath = 'build/package.json';
const packageJsonText = await fs.readFile(packageJsonPath, 'utf-8');
const updatedPackageJsonText = packageJsonText.replace(
    /("@ms-smtp\/([^"]+)"\s*:\s*)"([^"]+)"/g,
    '$1"file:../ms-smtp-$2-$3.tgz"'
);
await fs.writeFile(packageJsonPath, updatedPackageJsonText);

// npm >= 12 reads the install-script policy from the root manifest only.
const rootPackageJson = JSON.parse(await fs.readFile('package.json', 'utf-8'));
if (rootPackageJson.allowScripts) {
    const buildPackageJson = JSON.parse(updatedPackageJsonText);
    buildPackageJson.allowScripts = rootPackageJson.allowScripts;
    await fs.writeFile(packageJsonPath, JSON.stringify(buildPackageJson, null, 2) + "\n");
}

// Do actual build
const cwd = process.cwd();
process.chdir('build');

// --package-lock-only extracts bundleDependencies by tarball URL, which npm >= 12 blocks as "remote".
execSync(`npm install --package-lock-only --allow-remote=all`, { stdio: "inherit" });
execSync(`npm ci`, { stdio: "inherit" });
execSync(`npm run build:next`, { stdio: "inherit" });

process.chdir(cwd);

if (process.env.ANALYZE === 'true') {
    process.exit(0);
}

// Iterate ./.next and copy everything except server.js
const targetMappings: { [key: string]: string } = {
    "build/.next/standalone/": "dist/",
    "build/.next/static/": "dist/.next/static/",
    "build/node_modules/": "dist/node_modules/",
};

function mapPath(from: string): string | undefined {
    for (const [key, value] of Object.entries(targetMappings)) {
        const relativePath = path.relative(key, from);
        if (relativePath.startsWith("..")) continue;
        return path.join(value, relativePath);
    }
    return undefined;
}

const symlinksToCreate: { file: string, target: string }[] = [];
const standaloneFiles = await fs.readdir(`build/.next/standalone`);
for (const file of standaloneFiles) {
    if (file === 'server.js') {
        continue;
    }
    await fs.cp(`build/.next/standalone/${ file }`, `dist/${ file }`, {
        preserveTimestamps: true,
        force: true,
        recursive: true,
        filter: async (src, dest) => {
            const s = await fs.lstat(src);
            if (s.isSymbolicLink()) {
                const realTarget = await fs.realpath(src);
                const mappedTarget = mapPath(realTarget);
                assert(mappedTarget, `Cannot map symbolic link ${ src } target path pointing to ${ realTarget }`);
                assert((await fs.lstat(realTarget)).isDirectory(), `Expecting symbolic link to a directory ${ src }`);
                const mappedSrc = mapPath(src);
                assert(mappedSrc, `Cannot map source path ${ src }`);
                const relativeFromRoot = path.relative(path.dirname(mappedSrc), mappedTarget);
                symlinksToCreate.push({ file: dest, target: relativeFromRoot });
                return false;
            }
            return true;
        }
    });
}

for (const {file, target} of symlinksToCreate) {
    if (await fsExtra.pathExists(file)) {
        await fs.unlink(file);
    }
    try {
        // Type parameter is used only on Windows, first try junction points
        await fs.symlink(target, file, 'junction');
    } catch (e) {
        // The dir fallback requires Developer Mode active
        try {
            await fs.symlink(target, file, 'dir');
        } catch {
            // Rethrow the junction error that one should work
            throw e;
        }
    }
}

// Copy static files
await fs.cp(`build/.next/static`, 'dist/.next/static', {
    preserveTimestamps: true,
    force: true,
    recursive: true
});

// Copy public files
await fs.mkdir('dist/public', { recursive: true });
const publicFiles = await fs.readdir(`${ nextRoot }/public`);
for (const file of publicFiles) {
    // noinspection SpellCheckingInspection
    if (file !== '.gitkeep') {
        await fs.cp(`${ nextRoot }/public/${ file }`, `dist/public/${ file }`, {
            preserveTimestamps: true,
            force: true,
            recursive: true
        });
    }
}

// Create DB directories
await fs.mkdir('dist/data', { recursive: true });

// Server and dependencies
const binFiles = await fs.readdir('build/dist/bin');
for (const file of binFiles) {
    execSync(`node --import=@swc-node/register/esm-register ./install.ts ./build ./dist/bin/${ file } ./dist`, { stdio: 'inherit' });
}

// Create file env with production environment variables
await fs.writeFile('./dist/.env', 'NODE_ENV=production\nNEXT_MANUAL_SIG_HANDLE=true\nNEXT_TELEMETRY_DISABLED=1\n');
