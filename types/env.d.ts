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
        DISALLOWED_EMAILS_LIST?: string;
        DISALLOWED_EMAILS_LIST_FILE?: string;
        DISALLOWED_EMAILS_REGEX?: string;
        DISALLOWED_EMAILS_REGEX_FILE?: string;
        DISALLOWED_DOMAINS_LIST?: string;
        DISALLOWED_DOMAINS_LIST_FILE?: string;
        DISALLOWED_DOMAINS_REGEX?: string;
        DISALLOWED_DOMAINS_REGEX_FILE?: string;
        ALLOWED_EMAILS_LIST?: string;
        ALLOWED_EMAILS_LIST_FILE?: string;
        ALLOWED_EMAILS_REGEX?: string;
        ALLOWED_EMAILS_REGEX_FILE?: string;
        ALLOWED_DOMAINS_LIST?: string;
        ALLOWED_DOMAINS_LIST_FILE?: string;
        ALLOWED_DOMAINS_REGEX?: string;
        ALLOWED_DOMAINS_REGEX_FILE?: string;
        RULES_ORDER?: string;
    }
}
