import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";
import { MicrosoftOAuthCredentials } from "./microsoft.js";
import _ from "lodash";
import config from "./config.js";

export type Connection = Database;

let db: Connection | undefined;

export type User = {
    uid: string;
    username: string;
    email: string;
    credentials: MicrosoftOAuthCredentials;
    smtpPassword: string;
    appId: string;
};

export async function getDb() {
    if (!db) {
        const filename = config.db;
        db = await open({
            filename,
            driver: sqlite3.Database,
        });

        const versionResult = await db.get<{ user_version: number }>(`PRAGMA user_version;`);

        if ((versionResult?.user_version ?? 0) === 0) {
            // create schema
            await db.exec(`
                CREATE TABLE IF NOT EXISTS tokens (
                    -- Unique user ID
                    uid TEXT NOT NULL PRIMARY KEY,
                    -- Login hint
                    username TEXT NOT NULL,
                    -- Registered email address (not necessarily unique)
                    email TEXT NOT NULL,
                    -- SMTP password together with email
                    smtp_password TEXT NOT NULL,
                    -- SMTP password last update
                    smtp_password_updated_at TIMESTAMP DEFAULT (datetime('now', 'subsecond')),
                    -- Used application
                    app_id TEXT NOT NULL,
                    -- MSAL cache
                    cache TEXT NOT NULL,
                    -- Access token expiration
                    expires_at TIMESTAMP NULL,
                    -- User creation
                    created_at TIMESTAMP DEFAULT (datetime('now', 'subsecond')),
                    -- Last update
                    updated_at TIMESTAMP DEFAULT (datetime('now', 'subsecond'))
                );
                CREATE INDEX IF NOT EXISTS idx_tokens_email ON tokens (email);
                PRAGMA user_version = 1;
            `);
        }
    }
    return db;
}

export async function endDb() {
    if (db) {
        await db.close();
        db = undefined;
    }
}

async function getDbUserWhere(where: string, ...args: unknown[]): Promise<User | undefined> {
    const db = await getDb();
    const user = await db.get<{
        uid: string;
        username: string;
        email: string;
        smtp_password: string;
        app_id: string;
        cache: string;
        expires_at: number | null;
    }>(`SELECT uid, username, email, smtp_password, app_id, cache, unixepoch(expires_at, 'subsecond') AS expires_at
        FROM tokens
        WHERE ${ where }`, ...args);
    return user
        ? {
            uid: user.uid,
            username: user.username,
            email: user.email,
            smtpPassword: user.smtp_password,
            appId: user.app_id,
            credentials: { cache: user.cache, expires: _.isNil(user.expires_at) ? undefined : new Date(user.expires_at * 1000) },
        }
        : undefined;
}

export async function getDbUser(uid?: string): Promise<User | undefined> {
    return uid ? await getDbUserWhere("uid = ?", uid) : undefined;
}

export async function getDbUserByEmailPassword(email: string, password: string): Promise<User | undefined> {
    return await getDbUserWhere("email = ? AND smtp_password = ?", email, password);
}

// Only for testing, in reality user emails might not be unique
export async function getDbUserByEmail(email: string): Promise<User | undefined> {
    return await getDbUserWhere("email = ?", email);
}

export async function deleteDbUser(uid: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE
                  FROM tokens
                  WHERE uid = ?`, uid);
}

export async function updateDbUserSmtpPassword(
    uid: string,
    email: string,
    smtp_password: string
) {
    const db = await getDb();
    await db.run(
        `UPDATE tokens
         SET email = ?,
             smtp_password = ?,
             smtp_password_updated_at = datetime('now', 'subsecond'),
             updated_at = datetime('now', 'subsecond')
         WHERE uid = ?`,
        email,
        smtp_password,
        uid
    );
    return await getDbUser(uid);
}

export async function updateDbUserCredentials(uid: string, username: string, cache: unknown, expiresAt?: Date) {
    const db = await getDb();
    await db.run(
        `UPDATE tokens
         SET username = ?,
             cache = ?,
             expires_at = datetime(?, 'subsecond'),
             updated_at = datetime('now', 'subsecond')
         WHERE uid = ?`,
        username,
        _.isString(cache) ? cache : JSON.stringify(cache),
        _.isNil(expiresAt) ? null : expiresAt.toISOString(),
        uid
    );
    return await getDbUser(uid);
}

export async function upsertDbUser(uid: string, username: string, email: string, smtpPassword: string, appId: string, cache: unknown, expiresAt: Date) {
    const db = await getDb();
    await db.run(
        `INSERT INTO tokens (uid, username, email, smtp_password, app_id, cache, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime(?, 'subsecond')) ON CONFLICT DO
         UPDATE
         SET username = excluded.username,
             app_id = excluded.app_id,
             cache = excluded.cache,
             expires_at = excluded.expires_at,
             updated_at = datetime('now', 'subsecond')`,
        uid,
        username,
        email,
        smtpPassword,
        appId,
        _.isString(cache) ? cache : JSON.stringify(cache),
        expiresAt.toISOString(),
    );
    return await getDbUser(email);
}

export async function getDbExpiredUsers(): Promise<User[]> {
    const db = await getDb();
    const users = await db.all<[{
        uid: string;
        username: string;
        email: string;
        smtp_password: string;
        app_id: string;
        cache: string;
        expires_at: number | null;
    }]>(`
        SELECT uid, username, email, smtp_password, app_id, cache, unixepoch(expires_at, 'subsecond') AS expires_at
        FROM tokens
        WHERE datetime('now', 'subsecond') >= expires_at AND cache != ''
    `);
    return users.map((user) => ({
        uid: user.uid,
        username: user.username,
        email: user.email,
        smtpPassword: user.smtp_password,
        appId: user.app_id,
        credentials: {
            cache: user.cache,
            expires: _.isNil(user.expires_at) ? undefined : new Date(user.expires_at * 1000)
        },
    } satisfies User));
}
