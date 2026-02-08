import { DatabaseSync, type StatementSync } from "node:sqlite";
import _ from "lodash";
import { getConfig } from "./config.ts";

export type MicrosoftOAuthCredentials = {
    cache: string,
    expires?: Date,
};

export type User = {
    uid: string;
    username: string;
    email: string;
    credentials: MicrosoftOAuthCredentials;
    smtpPassword: string;
    appId: string;
};

type DbUserRow = {
    uid: string;
    username: string;
    email: string;
    smtp_password: string;
    app_id: string;
    cache: string;
    expires_at: number | null;
};

type DbStatements = {
    getUserByUid: StatementSync;
    getUserByEmailPassword: StatementSync;
    getUserByEmail: StatementSync;
    deleteUser: StatementSync;
    updateUserSmtpPassword: StatementSync;
    updateUserCredentials: StatementSync;
    markDoRetry: StatementSync;
    markStopRetry: StatementSync;
    clearAllRetryFlags: StatementSync;
    upsertUser: StatementSync;
    getExpiredUsers: StatementSync;
    getRetryUsers: StatementSync;
};

type DbState = {
    connection: DatabaseSync;
    statements: DbStatements;
};

function mapDbUser(user?: DbUserRow): User | undefined {
    return user
        ? {
            uid: user.uid,
            username: user.username,
            email: user.email,
            smtpPassword: user.smtp_password,
            appId: user.app_id,
            credentials: {
                cache: user.cache,
                expires: _.isNil(user.expires_at) ? undefined : new Date(user.expires_at * 1000)
            },
        }
        : undefined;
}

export async function getDb(): Promise<DbState> {
    const config = await getConfig();
    let db: DbState | undefined = globalThis.__db__;
    if (!db) {
        const filename = config.db;
        const connection = new DatabaseSync(filename);

        const versionResult = connection.prepare(`PRAGMA user_version;`).get() as { user_version: number } | undefined;
        const userVersion = versionResult?.user_version ?? 0;

        if (userVersion === 0) {
            // create schema
            connection.exec(`
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
                    -- Retry refresh flag (network errors)
                    retry_refresh INTEGER NOT NULL DEFAULT 0,
                    -- User creation
                    created_at TIMESTAMP DEFAULT (datetime('now', 'subsecond')),
                    -- Last update
                    updated_at TIMESTAMP DEFAULT (datetime('now', 'subsecond'))
                );
                CREATE INDEX IF NOT EXISTS idx_tokens_email ON tokens (email);
                PRAGMA user_version = 2;
            `);
        } else if (userVersion === 1) {
            connection.exec(`
                ALTER TABLE tokens ADD COLUMN retry_refresh INTEGER NOT NULL DEFAULT 0;
                PRAGMA user_version = 2;
            `);
        }

        const statements: DbStatements = {
            getUserByUid: connection.prepare(`
                SELECT uid, username, email, smtp_password, app_id, cache, unixepoch(expires_at, 'subsecond') AS expires_at
                FROM tokens
                WHERE uid = :uid
            `),
            getUserByEmailPassword: connection.prepare(`
                SELECT uid, username, email, smtp_password, app_id, cache, unixepoch(expires_at, 'subsecond') AS expires_at
                FROM tokens
                WHERE email = :email AND smtp_password = :smtp_password
            `),
            getUserByEmail: connection.prepare(`
                SELECT uid, username, email, smtp_password, app_id, cache, unixepoch(expires_at, 'subsecond') AS expires_at
                FROM tokens
                WHERE email = :email
            `),
            deleteUser: connection.prepare(`
                DELETE
                FROM tokens
                WHERE uid = :uid
            `),
            updateUserSmtpPassword: connection.prepare(`
                UPDATE tokens
                SET email = :email,
                    smtp_password = :smtp_password,
                    smtp_password_updated_at = datetime('now', 'subsecond'),
                    updated_at = datetime('now', 'subsecond')
                WHERE uid = :uid
            `),
            updateUserCredentials: connection.prepare(`
                UPDATE tokens
                SET username = :username,
                    cache = :cache,
                    expires_at = datetime(:expires_at, 'subsecond'),
                    retry_refresh = 0,
                    updated_at = datetime('now', 'subsecond')
                WHERE uid = :uid
            `),
            markDoRetry: connection.prepare(`
                UPDATE tokens
                SET retry_refresh = 1,
                    updated_at = datetime('now', 'subsecond')
                WHERE uid = :uid
            `),
            markStopRetry: connection.prepare(`
                UPDATE tokens
                SET retry_refresh = 0,
                    updated_at = datetime('now', 'subsecond')
                WHERE uid = :uid
            `),
            clearAllRetryFlags: connection.prepare(`
                UPDATE tokens
                SET retry_refresh = 0,
                    updated_at = datetime('now', 'subsecond')
                WHERE retry_refresh = 1
            `),
            upsertUser: connection.prepare(`
                INSERT INTO tokens (uid, username, email, smtp_password, app_id, cache, expires_at)
                VALUES (:uid, :username, :email, :smtp_password, :app_id, :cache, datetime(:expires_at, 'subsecond')) ON CONFLICT DO
                UPDATE
                SET username = excluded.username,
                    app_id = excluded.app_id,
                    cache = excluded.cache,
                    expires_at = excluded.expires_at,
                    updated_at = datetime('now', 'subsecond')
            `),
            getExpiredUsers: connection.prepare(`
                SELECT uid, username, email, smtp_password, app_id, cache, unixepoch(expires_at, 'subsecond') AS expires_at
                FROM tokens
                WHERE datetime('now', 'subsecond') >= expires_at
                  AND cache != ''
                  AND retry_refresh = 0
            `),
            getRetryUsers: connection.prepare(`
                SELECT uid, username, email, smtp_password, app_id, cache, unixepoch(expires_at, 'subsecond') AS expires_at
                FROM tokens
                WHERE retry_refresh = 1
                  AND cache != ''
            `),
        };

        db = { connection, statements };
        globalThis.__db__ = db;
    }

    return db;
}

export async function endDb() {
    const db = globalThis.__db__;
    if (db) {
        db.connection.close();
        globalThis.__db__ = undefined;
    }
}

export async function getDbUser(uid?: string): Promise<User | undefined> {
    if (!uid) {
        return undefined;
    }
    const db = await getDb();
    const user = db.statements.getUserByUid.get({ uid }) as DbUserRow | undefined;
    return mapDbUser(user);
}

export async function getDbUserByEmailPassword(email: string, password: string): Promise<User | undefined> {
    const db = await getDb();
    const user = db.statements.getUserByEmailPassword.get({ email, smtp_password: password }) as DbUserRow | undefined;
    return mapDbUser(user);
}

// Only for testing, in reality user emails might not be unique
export async function getDbUserByEmail(email: string): Promise<User | undefined> {
    const db = await getDb();
    const user = db.statements.getUserByEmail.get({ email }) as DbUserRow | undefined;
    return mapDbUser(user);
}

export async function deleteDbUser(uid: string): Promise<void> {
    const db = await getDb();
    db.statements.deleteUser.run({ uid });
}

export async function updateDbUserSmtpPassword(
    uid: string,
    email: string,
    smtp_password: string
) {
    const db = await getDb();
    db.statements.updateUserSmtpPassword.run({
        email,
        smtp_password,
        uid,
    });
    return await getDbUser(uid);
}

export async function updateDbUserCredentials(uid: string, username: string, cache: unknown, expiresAt?: Date) {
    const db = await getDb();
    db.statements.updateUserCredentials.run({
        username,
        cache: _.isString(cache) ? cache : JSON.stringify(cache),
        expires_at: _.isNil(expiresAt) ? null : expiresAt.toISOString(),
        uid,
    });
    return await getDbUser(uid);
}

export async function markDbUserDoRetry(uid: string) {
    const db = await getDb();
    db.statements.markDoRetry.run({ uid });
}

export async function markDbUserStopRetry(uid: string) {
    const db = await getDb();
    db.statements.markStopRetry.run({ uid });
}

export async function clearAllDbRetryFlags() {
    const db = await getDb();
    db.statements.clearAllRetryFlags.run();
}

export async function upsertDbUser(uid: string, username: string, email: string, smtpPassword: string, appId: string, cache: unknown, expiresAt: Date) {
    const db = await getDb();
    db.statements.upsertUser.run({
        uid,
        username,
        email,
        smtp_password: smtpPassword,
        app_id: appId,
        cache: _.isString(cache) ? cache : JSON.stringify(cache),
        expires_at: expiresAt.toISOString(),
    });
    return await getDbUser(uid);
}

export async function getDbExpiredUsers(): Promise<User[]> {
    const db = await getDb();
    const users = db.statements.getExpiredUsers.all() as DbUserRow[];
    return users.map((user) => mapDbUser(user)!).filter(Boolean);
}

export async function getDbRetryUsers(): Promise<User[]> {
    const db = await getDb();
    const users = db.statements.getRetryUsers.all() as DbUserRow[];
    return users.map((user) => mapDbUser(user)!).filter(Boolean);
}
