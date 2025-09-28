import type { OptionsType } from "cookies-next/server";
import { getCookie, setCookie } from "cookies-next/server";
import _ from "lodash";

export async function showNotification(type: string, message: string, context: OptionsType) {
    const COOKIE_NAME = "show_notifications";
    const value = [];
    const existingValue = await getCookie(COOKIE_NAME, context);
    try {
        if (existingValue !== undefined) {
            const parsed = JSON.parse(existingValue);
            if (_.isArray(parsed)) {
                value.push(...parsed);
            }
        }
    } catch (err) {
        console.warn(`Error reading cookie ${ COOKIE_NAME }, ignoring: ${ err }`);
    }
    value.push({type: type, message: message});
    await setCookie(COOKIE_NAME, JSON.stringify(value), context);
}
