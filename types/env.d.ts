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
        // noinspection SpellCheckingInspection
        SMTP_AUTOTLS_PORT?: string;
        SMTP_PROTOCOL_INSPECTION_DELAY_MS?: string;
        SMTP_KEY_FILE?: string;
        SMTP_CERT_FILE?: string;
        SMTP_PUBLIC_HOST?: string;
        SMTP_GREETING_NAME?: string;
        SMTP_PUBLIC_TLS_PORT?: string;
        SMTP_PUBLIC_STARTTLS_PORT?: string;
        HTTP_HOST?: string;
        HTTP_PORT?: string;
        HTTPS_KEY_FILE?: string;
        HTTPS_CERT_FILE?: string;
        WEB_HAS_TLS?: string;
        WEB_HAS_STARTTLS?: string;
        WEB_COUNT_PORTS?: string;
        WEB_SMTP_SERVER?: string;
        WEB_TLS_PORT_LIST?: string;
        WEB_STARTTLS_PORT_LIST?: string;
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
