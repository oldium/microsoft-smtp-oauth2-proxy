import React from "react";
import _ from "lodash";
import ConfigItem from "./config_item";
import ConfigItemRows from "./config_item_rows";

export default function ServerConnectionConfig() {
    // Protocol priority from lowest to highest
    const tlsPortList = _.chain((process.env.WEB_TLS_PORT_LIST ?? "").split(","))
        .map((port) => port.trim()).filter(Boolean)
        .sort()
        .map((port) => ({ port, security: "TLS" }))
        .value();
    const startTlsPortList = _.chain((process.env.WEB_STARTTLS_PORT_LIST ?? "").split(","))
        .map((port) => port.trim()).filter(Boolean)
        .sort()
        .map((port) => ({ port, security: "STARTTLS" }))
        .value();
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
