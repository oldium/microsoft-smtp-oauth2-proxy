"use client"

import ConfigItem from "./config_item.tsx";
import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import ReloadButton from "./reload_button.tsx";
import UserDto from "@ms-smtp/common/dto/user_dto";
import { toast } from "./toaster.tsx";

export default function AuthPassword( params: { password: string } ) {
    const { password: initialPassword } = params;
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [password, setPassword] = useState(initialPassword);

    const doResetPassword = useCallback(async () => {
        try {
            setLoading(true);
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
        } finally {
            setLoading(false);
        }
    }, [password]);

    return (<>
        <ConfigItem label="Password" loading={ loading } disabled={ loading }
                    value={ password }>
            <ReloadButton onClick={ doResetPassword } disabled={ loading }/>
        </ConfigItem>
    </>);
}
