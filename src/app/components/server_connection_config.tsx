import React from "react";
import _ from "lodash";
import ConfigItem from "./config_item";
import ConfigItemRows from "./config_item_rows";

export default function ServerConnectionConfig() {
    const portList = (process.env.WEB_PORT_LIST ?? "").split(",");
    const securityList = (process.env.WEB_SECURITY_LIST ?? "").split(",");
    const ports = _.zip(portList, securityList).map(
        ([port, security]) => ({ port, security })) as { port: string, security: string }[];
    const smtpInfo = {
        smtpServer: process.env.WEB_SMTP_SERVER!,
        smtpPorts: ports,
    }
    return (<>
            <ConfigItem label="Server" value={ smtpInfo.smtpServer }/>
            <ConfigItemRows labels={ ["Port", "Security"] } rows={ smtpInfo.smtpPorts }
                            valuesMapper={ (row: {
                                port: number | string,
                                security: string
                            }) => [row.port, row.security] }
                            gridClassName="grid-cols-2"
            />
        </>
    );
}
