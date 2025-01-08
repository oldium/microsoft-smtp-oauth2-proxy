import React, { memo } from "react";
import _ from "lodash";
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
    return (_.isEqual(prevProps.rows, nextProps.rows)
        && !!prevProps.loading === !!nextProps.loading
        && !!prevProps.disabled === !!nextProps.disabled);
}) as typeof ConfigItemRows;
