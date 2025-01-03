import fs from "node:fs/promises";
import { execSync } from "node:child_process";

// Next.js
execSync('next build', { stdio: 'inherit' });

// Iterate ./.next and copy everything except server.js
const standaloneFiles = await fs.readdir('./.next/standalone');
for (const file of standaloneFiles) {
    if (file === 'server.js') {
        continue;
    }
    await fs.cp(`./.next/standalone/${ file }`, `./dist/${ file }`, {
        preserveTimestamps: true,
        force: true,
        recursive: true
    });
}

// Copy static files
await fs.cp('./.next/static', './dist/.next/static', { preserveTimestamps: true, force: true, recursive: true });

// Copy public files
await fs.mkdir('./dist/public', { recursive: true });
const publicFiles = await fs.readdir('./public');
for (const file of publicFiles) {
    if (file !== '.gitkeep') {
        await fs.cp(`./public/${ file }`, `./dist/public/${ file }`, {
            preserveTimestamps: true,
            force: true,
            recursive: true
        });
    }
}

// Create DB directories
await fs.mkdir('./dist/data', { recursive: true });

// Server and dependencies
execSync('tsc --project ./server/tsconfig.json', { stdio: 'inherit' });
execSync('node --import=extensionless/register --import=@swc-node/register/esm-register ./install.ts ./node_modules/extensionless/src/register.js ./dist', { stdio: 'inherit' });
execSync('node --import=extensionless/register --import=@swc-node/register/esm-register ./install.ts ./dist/server/server.js ./dist', { stdio: 'inherit' });

// Create file env with production environment variables
await fs.writeFile('./dist/env', 'NODE_ENV=production\nNEXT_MANUAL_SIG_HANDLE=true\n');
