import fs from "node:fs/promises";
import _ from "lodash";

export class EmailNotAllowed extends Error {
    constructor(public readonly email: string, public readonly domain: string) {
        super(`Email ${ email } is not allowed`);
        this.name = "EmailNotAllowed";
    }
}

export const DEFAULT_RULES_ORDER: FilterType[] = [
    "DISALLOWED_EMAILS_LIST",
    "DISALLOWED_EMAILS_LIST_FILE",
    "DISALLOWED_EMAILS_REGEX",
    "DISALLOWED_EMAILS_REGEX_FILE",
    "DISALLOWED_DOMAINS_LIST",
    "DISALLOWED_DOMAINS_LIST_FILE",
    "DISALLOWED_DOMAINS_REGEX", "DISALLOWED_DOMAINS_REGEX_FILE",
    "ALLOWED_EMAILS_LIST",
    "ALLOWED_EMAILS_LIST_FILE",
    "ALLOWED_EMAILS_REGEX",
    "ALLOWED_EMAILS_REGEX_FILE",
    "ALLOWED_DOMAINS_LIST",
    "ALLOWED_DOMAINS_LIST_FILE",
    "ALLOWED_DOMAINS_REGEX",
    "ALLOWED_DOMAINS_REGEX_FILE"
]

export type FilterType =
    "DISALLOWED_EMAILS_LIST"
    | "DISALLOWED_EMAILS_LIST_FILE"
    | "DISALLOWED_EMAILS_REGEX"
    | "DISALLOWED_EMAILS_REGEX_FILE"
    | "DISALLOWED_DOMAINS_LIST"
    | "DISALLOWED_DOMAINS_LIST_FILE"
    | "DISALLOWED_DOMAINS_REGEX"
    | "DISALLOWED_DOMAINS_REGEX_FILE"
    | "ALLOWED_EMAILS_LIST"
    | "ALLOWED_EMAILS_LIST_FILE"
    | "ALLOWED_EMAILS_REGEX"
    | "ALLOWED_EMAILS_REGEX_FILE"
    | "ALLOWED_DOMAINS_LIST"
    | "ALLOWED_DOMAINS_LIST_FILE"
    | "ALLOWED_DOMAINS_REGEX"
    | "ALLOWED_DOMAINS_REGEX_FILE";

export type Filter = (email: string, domain: string) => boolean;

export type RuleSet = {
    [key in FilterType]: Filter;
} & {
    order: FilterType[];
};

const fileRefresh: (() => Promise<void>)[] = [];

function createListMatcher(items: string[], onlyDomain: boolean): Filter {
    return (email: string, domain: string) => {
        if (onlyDomain) {
            return items.includes(domain);
        } else {
            return items.includes(email);
        }
    };
}

function createRegexMatcher(regex: RegExp[], onlyDomain: boolean): Filter {
    return (email: string, domain: string) => {
        const target = onlyDomain ? domain : email;
        return regex.some((re) => re.test(target));
    };
}

async function createListFilter(value: string, onlyDomain: boolean): Promise<Filter> {
    const items: string[] = value.split(",").map(
        (item) => item.trim().toLowerCase()).filter((item) => item.length > 0);
    return createListMatcher(items, onlyDomain);
}

async function createListFileFilter(value: string, onlyDomain: boolean): Promise<Filter> {
    const items: string[] = [];
    const refresh = async () => {
        try {
            const file = await fs.readFile(value);
            const newItems = file.toString().split("\n").map(
                (item) => item.trim().toLowerCase()).filter((item) => item.length > 0);

            // Replace items content in-place
            items.splice(0, items.length, ...newItems);
        } catch (err) {
            console.warn(`Error reading filter file ${ value }, ignoring: ${ err }`);
        }
    }
    await refresh();
    fileRefresh.push(refresh);
    return createListMatcher(items, onlyDomain);
}

async function createRegexFilter(value: string, onlyDomain: boolean): Promise<Filter> {
    const regex = new RegExp(`^(${value})$`, "i");
    return createRegexMatcher([regex], onlyDomain);
}

async function createRegexFileFilter(value: string, onlyDomain: boolean): Promise<Filter> {
    const regex: RegExp[] = [];
    const refresh = async () => {
        try {
            const file = await fs.readFile(value);
            const newRegex = file.toString().split("\n").map(
                (item) => item.trim()).filter((item) => item.length > 0);

            // Replace regex content in-place
            regex.splice(0, regex.length, ...newRegex.map(
                (re) => new RegExp(`^(${re})$`, "i")));
        } catch (err) {
            console.warn(`Error reading filter file ${ value }, ignoring: ${ err }`);
        }
    }
    await refresh();
    fileRefresh.push(refresh);
    return createRegexMatcher(regex, onlyDomain);
}

export async function createFilter(type: FilterType, value: string): Promise<Filter> {
    switch (type) {
        case "DISALLOWED_EMAILS_LIST":
        case "DISALLOWED_DOMAINS_LIST":
        case "ALLOWED_EMAILS_LIST":
        case "ALLOWED_DOMAINS_LIST":
            return await createListFilter(value, type.includes("DOMAINS"));
        case "DISALLOWED_EMAILS_LIST_FILE":
        case "DISALLOWED_DOMAINS_LIST_FILE":
        case "ALLOWED_EMAILS_LIST_FILE":
        case "ALLOWED_DOMAINS_LIST_FILE":
            return await createListFileFilter(value, type.includes("DOMAINS"));
        case "DISALLOWED_EMAILS_REGEX":
        case "DISALLOWED_DOMAINS_REGEX":
        case "ALLOWED_EMAILS_REGEX":
        case "ALLOWED_DOMAINS_REGEX":
            return await createRegexFilter(value, type.includes("DOMAINS"));
        case "DISALLOWED_EMAILS_REGEX_FILE":
        case "DISALLOWED_DOMAINS_REGEX_FILE":
        case "ALLOWED_EMAILS_REGEX_FILE":
        case "ALLOWED_DOMAINS_REGEX_FILE":
            return await createRegexFileFilter(value, type.includes("DOMAINS"));
        default:
            throw new Error(`Unknown filter type: ${ type }`);
    }
}

export function applyFilters(email: string, ruleSet: RuleSet): void {
    const matchEmail = email.toLowerCase();
    const matchDomain = matchEmail.substring(matchEmail.indexOf("@") + 1);

    const matchIndex = ruleSet.order.findIndex((type) => {
        if (ruleSet[type] !== undefined) {
            return ruleSet[type].call(null, matchEmail, matchDomain);
        } else {
            return false;
        }
    });
    if (matchIndex >= 0) {
        if (!ruleSet.order[matchIndex].includes("ALLOWED")) {
            throw new EmailNotAllowed(matchEmail, matchDomain);
        }
    } else {
        // Default decision
        if (_.keys(ruleSet).find((type) => type.includes("ALLOWED")) !== undefined) {
            throw new EmailNotAllowed(matchEmail, matchDomain);
        }
    }
}

export async function refreshFilters(): Promise<void> {
    await Promise.allSettled(fileRefresh.map(async (refresh) => await refresh()));
}
