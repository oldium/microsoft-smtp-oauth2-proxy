import { getAccessToken, UserToken } from "./microsoft";
import { getDbUserByEmailPassword } from "./db";

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
