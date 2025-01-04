import ConfigButton from "./config_button";
import { Copy } from "lucide-react";
import React, { useCallback } from "react";
import { toast } from "./toaster";

export default function CopyButton(props: { value: string | number, disabled: boolean }) {
    const doCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(String(props.value));
            toast("success", "Value copied to clipboard");
        } catch {
            toast("error", "Failed to copy to clipboard");
        }
    }, [props.value]);
    return <ConfigButton
        onClick={ doCopy }
        disabled={ props.disabled }
    >
        <Copy className="h-5 w-5"/>
    </ConfigButton>;
}
