// noinspection JSUnusedGlobalSymbols
declare namespace NodeJS {
    interface ProcessEnv {
        APP_SECRETS?: string;
        DEFAULT_APP_ID?: string;
        SQLITE_PATH?: string;
        SESSION_COOKIE?: string;
        SESSION_SECRET?: string;
        SMTP_TARGET_HOST?: string;
        SMTP_TARGET_PORT?: string;
        SMTP_TARGET_TLS?: string;
        SMTP_HOST?: string;
        SMTP_PORT?: string;
        SMTP_TLS_PORT?: string;
        SMTP_STARTTLS_PORT?: string;
        SMTP_KEY_FILE?: string;
        SMTP_CERT_FILE?: string;
        SMTP_PUBLIC_HOST?: string;
        SMTP_GREETING_NAME?: string;
        SMTP_PUBLIC_PORT?: string;
        SMTP_PUBLIC_TLS_PORT?: string;
        SMTP_PUBLIC_STARTTLS_PORT?: string;
        HTTP_HOST?: string;
        HTTP_PORT?: string;
        HTTPS_KEY_FILE?: string;
        HTTPS_CERT_FILE?: string;
        NEXT_PUBLIC_HAS_TLS?: string;
        NEXT_PUBLIC_HAS_STARTTLS?: string;
        NEXT_PUBLIC_COUNT_PORTS?: string;
    }
}
