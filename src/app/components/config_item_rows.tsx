import React, { memo } from "react";
import ConfigItemsLine from "./config_items_line";

function ConfigItemRows<T>(props: {
    labels: string[],
    rows: T[],
    valuesMapper: (row: T) => (number | string)[],
    gridClassName: string,
    disabled?: boolean,
    loading?: boolean,
}) {
    return (<> {
        props.rows.map(props.valuesMapper).map((values, index) =>
            <ConfigItemsLine key={ index } loading={ props.loading } disabled={ props.disabled }
                             labels={ props.labels }
                             values={ values }
                             gridClassName={ props.gridClassName }
            />)
    } </>);
}

export default memo(ConfigItemRows, (prevProps, nextProps) => {
    if (prevProps.rows.length !== nextProps.rows.length
        || !!prevProps.loading !== !!nextProps.loading
        || !!prevProps.disabled !== !!nextProps.disabled) {
        return false;
    }
    const prevValues = prevProps.rows.map(prevProps.valuesMapper);
    const nextValues = nextProps.rows.map(nextProps.valuesMapper);
    return (prevValues.every((values, index) => {
            return (values.length === nextValues[index].length
                && values.every((value, valueIndex) => value === nextValues[index][valueIndex]));
        }));
}) as typeof ConfigItemRows;
