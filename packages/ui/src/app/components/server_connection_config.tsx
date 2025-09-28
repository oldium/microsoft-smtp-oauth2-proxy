import React from "react";
import ConfigItem from "./config_item.tsx";
import ConfigItemRows from "./config_item_rows.tsx";
import { getConfig } from "@ms-smtp/common/lib/config";
import { connection } from "next/server";

export default async function ServerConnectionConfig() {
    await connection();

    const config = await getConfig();
    const tlsPortList = config.ui.tlsPortList.map((port) => ({ port, security: "TLS" }));
    const startTlsPortList = config.ui.startTlsPortList.map((port) => ({ port, security: "STARTTLS" }));

    const ports = [
        ...tlsPortList,
        ...startTlsPortList,
    ];
    const smtpInfo = {
        smtpServer: config.ui.smtpServer,
        smtpPorts: ports,
    }
    return (<>
            <ConfigItem label="Server" value={ smtpInfo.smtpServer }/>
            <ConfigItemRows labels={ ["Security", "Port"] } rows={ smtpInfo.smtpPorts }
                            valuesMapper={ (row: {
                                port: number | string,
                                security: string
                            }) => [row.security, row.port] }
                            gridClassName="grid-cols-2"
            />
        </>
    );
}
