import { getAccessToken, UserToken } from "./microsoft.ts";
import { getDbUserByEmailPassword } from "@ms-smtp/common/lib/db";

export async function userAuth(username: string, password: string): Promise<UserToken | null> {
    try {
        const user = await getDbUserByEmailPassword(username, password);
        if (user) {
            return await getAccessToken(user);
        }
    } catch {
        // Nothing to do
    }
    return null;
}
