import ConfigButton from "./config_button";
import { RefreshCw } from "lucide-react";
import React from "react";

export default function ReloadButton(props: { onClick: () => Promise<void>, disabled: boolean }) {
    const [reloading, setReloading] = React.useState(false);
    const doReload = async () => {
        if (!reloading) {
            setReloading(true);
            try {
                await props.onClick();
            } finally {
                setReloading(false);
            }
        }
    };
    return <ConfigButton
        onClick={ doReload }
        disabled={ props.disabled }
    >
        <RefreshCw
            className={ `h-5 w-5 ${ reloading ? " animate-spin" : "" }` }/>
    </ConfigButton>;
};
