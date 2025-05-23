'use client';

import { useEffect } from "react";
import { deleteCookie, getCookie } from "cookies-next/client";
import { toast, ToastType } from "./toaster";
import { useRouter } from "next/navigation";
// noinspection SpellCheckingInspection
import striptags from "striptags";

export default function ShowToastsFromCookie() {
    const router = useRouter();

    useEffect(() => {
        const COOKIE_NAME = "show_notifications";
        const value = getCookie(COOKIE_NAME);
        if (value !== undefined) {
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) {
                    for (const rawMessage of parsed) {
                        if (typeof rawMessage === "object" && !Array.isArray(rawMessage) && 'message' in rawMessage) {
                            const messageObject = rawMessage as { message: unknown, type?: unknown };
                            const message = striptags(String(messageObject.message));
                            const type = messageObject.type ? String(messageObject.type) : "error";

                            toast(type as ToastType, message);
                        } else {
                            toast("error", striptags(String(rawMessage)));
                        }
                    }
                }
            } catch (err) {
                console.warn(`Error reading cookie ${ COOKIE_NAME }, ignoring: ${ err }`);
            }
            deleteCookie(COOKIE_NAME);
        }
    }, [router]);

    return null;
}
