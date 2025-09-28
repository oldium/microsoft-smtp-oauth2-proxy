import "server-only";

import ConfigItem from "./config_item.tsx";
import React from "react";

export default function AuthUsername( { username }: { username: string} ) {
    return (<>
        <ConfigItem label="Username"
                    value={ username }/>
    </>);
}
