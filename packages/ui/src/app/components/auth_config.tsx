import React from "react"
import AuthUsername from "./auth_username.tsx";
import AuthPassword from "./auth_password.tsx";
import { cookies } from "next/headers";
import { getWebSessionUser, webSessionFromCookieStore } from "@ms-smtp/common/lib/websession";
import { redirect } from "next/navigation";

export default async function AuthConfig() {
    try {
        const cookieStore = await cookies();
        const session = await webSessionFromCookieStore(cookieStore);
        const user = await getWebSessionUser(session);

        const username = user!.email;
        const password = user!.smtpPassword;

        return (<>
                <AuthUsername username={ username }/>
                <AuthPassword password={ password }/>
            </>
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
        redirect("/");
    }
}
