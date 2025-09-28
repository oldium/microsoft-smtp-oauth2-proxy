import { NextRequest, NextResponse } from 'next/server.js'
import { getWebSessionUser, UnauthorizedError, webSessionFromCookieStore } from "@ms-smtp/common/lib/websession";
import { showNotification } from "@ms-smtp/common/lib/cookies";
import { cookies } from "next/headers.js";

export const config = {
    matcher: ['/configuration']
};

export async function proxy(request: NextRequest) {
    try {
        const session = await webSessionFromCookieStore(await cookies());
        await getWebSessionUser(session);
        return NextResponse.next();
    } catch (err) {
        const response = NextResponse.redirect(new URL('/', request.url));

        if (err instanceof UnauthorizedError) {
            await showNotification("info", "Session expired, please log in again", { req: request, res: response });
        } else {
            await showNotification("error", "An error occurred. Please try again later.", { req: request, res: response });
        }

        return response;
    }
}
