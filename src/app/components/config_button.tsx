import React from "react";

export default function ConfigButton(props: { children: React.ReactNode, onClick: () => Promise<void> | void, disabled: boolean }) {
    return <button
        onClick={ props.onClick }
        className="flex-none p-2 hover:enabled:bg-gray-200 hover:dark:enabled:bg-gray-200 text-gray-600 dark:text-gray-400 hover:dark:text-gray-950 rounded-lg transition-colors"
        title="Copy to clipboard"
        disabled={ props.disabled }
    >
        { props.children }
    </button>;
};
