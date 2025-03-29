"use client";

import React, { useCallback } from "react";
import UrlActionDto from "../../../dto/url_action_dto";
import { toast } from "./toaster";
import { LogOut, MailX } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AuthActions() {
    const router = useRouter();

    const doCancel = useCallback(async () => {
        try {
            const res = await fetch("/auth/cancel", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            if (res.ok) {
                const data: UrlActionDto = await res.json();
                router.push(data?.url ?? "/");
            } else if (res.status === 401) {
                router.push("/");
            } else {
                toast("error", "An error occurred. Please try again later.");
            }
        } catch {
            toast("error", "An error occurred. Please try again later.");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const doLogout = useCallback(async () => {
        try {
            const res = await fetch("/auth/logout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            if (res.ok) {
                const data: UrlActionDto = await res.json();
                router.push(data?.url ?? "/");
            } else if (res.status == 401) {
                router.push("/");
            } else {
                toast("error", "An error occurred. Please try again later.");
            }
        } catch {
            toast("error", "An error occurred. Please try again later.");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (<>
            <button
                className="inline-flex items-center px-8 py-4 border border-transparent text-lg font-medium rounded-xl text-white bg-red-500 hover:bg-red-800 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-red-800 transition-all duration-200 hover:scale-105"
                onClick={ doCancel }
            >
                Cancel
                <MailX className="ml-3 h-5 w-5"/>
            </button>
            <button
                className="inline-flex items-center px-8 py-4 border border-transparent text-lg font-medium rounded-xl text-white bg-sky-500 hover:bg-sky-800 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-sky-800 transition-all duration-200 hover:scale-105"
                onClick={ doLogout }
            >
                Sign out
                <LogOut className="ml-3 h-5 w-5"/>
            </button>
        </>
    );
}
