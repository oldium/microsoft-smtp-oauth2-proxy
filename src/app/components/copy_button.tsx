"use client";

import ConfigButton from "./config_button";
import { Copy } from "lucide-react";
import React, { useCallback } from "react";
import { toast } from "./toaster";

export default function CopyButton(props: { value: string | number, disabled: boolean }) {
    const doCopy = async (value: string | number) => {
        "use client";
        try {
            await navigator.clipboard.writeText(String(value));
            toast("success", "Value copied to clipboard");
        } catch {
            toast("error", "Failed to copy to clipboard");
        }
    };
    return <ConfigButton
        onClick={ useCallback(() => doCopy(props.value), [props.value]) }
        disabled={ props.disabled }
    >
        <Copy className="h-5 w-5"/>
    </ConfigButton>;
}
