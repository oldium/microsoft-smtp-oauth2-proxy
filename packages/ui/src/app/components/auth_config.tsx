import React from "react"
import AuthUsername from "./auth_username.tsx";
import AuthPassword from "./auth_password.tsx";
import { cookies } from "next/headers";
import { getWebSessionUser, webSessionFromCookieStore } from "@ms-smtp/common/lib/websession";
import { redirect } from "next/navigation";

export default async function AuthConfig() {
    let username: string;
    let password: string;
    try {
        const cookieStore = await cookies();
        const session = await webSessionFromCookieStore(cookieStore);
        const user = await getWebSessionUser(session);

        username = user!.email;
        password = user!.smtpPassword;
    } catch {
        redirect("/");
    }

    return (<>
            <AuthUsername username={ username }/>
            <AuthPassword password={ password }/>
        </>
    );
}
