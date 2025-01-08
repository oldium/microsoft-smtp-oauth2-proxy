import yn from "yn";
import React from "react";

export function ServerProtoConfig() {
    const portInfo = {
        hasTls: yn(process.env.WEB_HAS_TLS),
        hasStartTls: yn(process.env.WEB_HAS_STARTTLS),
    };

    return <>
        { portInfo.hasTls ? (
            <li>
                SMTP with SSL/TLS
            </li>
        ) : null }
        { portInfo.hasStartTls ? (
            <li>
                SMTP with STARTTLS
            </li>
        ) : null }
        { (!portInfo.hasTls && !portInfo.hasStartTls) ? (
            <li>
                No SMTP ports are exposed
            </li>
        ) : null }
    </>;
}
