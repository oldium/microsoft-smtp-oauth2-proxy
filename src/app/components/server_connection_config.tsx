import React from "react";
import ConfigItem from "./config_item";
import ConfigItemRows from "./config_item_rows";

function parsePortList(portList: string, security: string) {
    return (portList
        .split(",")
        .map((port) => port.trim())
        .filter(Boolean)
        .sort()
        .map((port) => ({ port, security })));
}

export default function ServerConnectionConfig() {
    // Protocol priority from lowest to highest
    const tlsPortList = parsePortList(process.env.WEB_TLS_PORT_LIST ?? "", "TLS");
    const startTlsPortList = parsePortList(process.env.WEB_STARTTLS_PORT_LIST ?? "", "STARTTLS");
    const ports = [
        ...tlsPortList,
        ...startTlsPortList,
    ];
    const smtpInfo = {
        smtpServer: process.env.WEB_SMTP_SERVER!,
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
