"use client";

import React, { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation";
import UserDto from "../../../dto/user_dto";
import { toast } from "./toaster";
import ConfigItem from "./config_item";
import ReloadButton from "./reload_button";

export default function AuthConfig() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    useEffect(() => {
        (async () => {
                try {
                    const res = await fetch("/api/user", { cache: "no-store" });
                    const data: UserDto = await res.json();
                    if (res.status === 401) {
                        toast("info", "Session expired, please log in again");
                        router.push("/");
                    } else if (!res.ok) {
                        toast("error", "An error occurred. Please try again later.");
                    } else {
                        setPassword(data.smtp_password);
                        setEmail(data.email);
                    }
                } catch {
                    toast("error", "An error occurred. Please try again later.");
                    setError(true);
                } finally {
                    setLoading(false);
                }
            }
        )();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const doResetPassword = useCallback(async () => {
        try {
            const res = await fetch("/api/reset", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            const data: UserDto = await res.json();
            if (!res.ok) {
                if (res.status == 401) {
                    toast("info", "Session expired, please log in again");
                    router.push("/");
                } else {
                    toast("error", "An error occurred. Please try again later.");
                }
            } else {
                toast("success", "Password changed successfully");
                setPassword(data.smtp_password);
            }
        } catch {
            toast("error", "An error occurred. Please try again later.");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [password]);

    return (<>
            <ConfigItem label="Username" loading={ loading } disabled={ loading || error }
                        value={ email }/>
            <ConfigItem label="Password" loading={ loading } disabled={ loading || error }
                        value={ password }>
                <ReloadButton onClick={ doResetPassword } disabled={ loading || error }/>
            </ConfigItem>
        </>
    );
}
