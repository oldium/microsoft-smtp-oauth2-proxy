import React, { memo } from "react";
import { LoaderCircle } from "lucide-react";
import CopyButton from "./copy_button";

type ConfigItemProps = {
    label: string;
    value: string | number;
    loading: boolean;
    disabled: boolean;
    children?: React.ReactNode;
}

export default memo(function ConfigItem(props: ConfigItemProps) {
    return <div
        className="flex items-center p-4 rounded-lg bg-gray-100 dark:text-gray-200 dark:bg-gray-800">
        <div className="flex-1">
            <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 uppercase">
                { props.label }
            </label>
            <div
                className={ `mt-1 text-lg font-mono text-black dark:text-gray-100` + (props.loading ? ` loading` : ``) }>
                { props.loading ?
                    <LoaderCircle className="inline-flex animate-spin mr-2"/> : props.value }
            </div>
        </div>
        { props.children }
        <CopyButton value={ props.value } disabled={ props.disabled }/>
    </div>;
}, (prevProps, nextProps) => {
    return (prevProps.value === nextProps.value
        && prevProps.loading === nextProps.loading
        && prevProps.disabled === nextProps.disabled);
});
