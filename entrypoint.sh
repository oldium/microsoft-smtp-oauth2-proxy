#!/bin/sh

: "${UID:=1000}"
: "${GID:=1000}"

# See https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
if [ "${UID}" != $(id -u node) ] || [ "${GID}" != $(id -g node) ]; then
    groupmod -g ${GID} node && usermod -u ${UID} -g ${GID} node
fi

# See https://stackoverflow.com/a/39398511/7080036
chown -R node:node /app/data
exec runuser -u node "$@"
