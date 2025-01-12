import ConfigItem from "./config_item";
import React, { memo } from "react";

export default memo(function ConfigItemsLine(props: {
    labels: string[],
    values: (number | string)[],
    disabled?: boolean,
    loading?: boolean,
    gridClassName: string,
}) {
    return <div className={ `grid ${ props.gridClassName } gap-4 py-2` }>
        { props.labels.map((label, index) => (
            <ConfigItem key={ index } label={ label } loading={ props.loading }
                        disabled={ props.disabled }
                        value={ props.values[index] }/>
        )) }
    </div>;
}, (prevProps, nextProps) => {
    if (prevProps.values.length !== nextProps.values.length
        || !!prevProps.loading !== !!nextProps.loading
        || !!prevProps.disabled !== !!nextProps.disabled) {
        return false;
    }
    return (prevProps.values.every((value, index) => value === nextProps.values[index]));
});
