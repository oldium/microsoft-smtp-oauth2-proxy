FROM node:24-trixie-slim AS builder

WORKDIR /build

# Copy package files and install dependencies
COPY --chmod=u=rw,go=r package*.json ./
COPY --chmod=u=rw,go=r packages/common/package*.json ./packages/common/
COPY --chmod=u=rw,go=r packages/lib/package*.json ./packages/lib/
COPY --chmod=u=rw,go=r packages/server/package*.json ./packages/server/
COPY --chmod=u=rw,go=r packages/ui/package*.json ./packages/ui/

RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy application files
COPY --chmod=u=rw,go=r . .
RUN find . -mindepth 1 -maxdepth 1 -type d ! -name node_modules -exec chmod -R ugo+X {} +

# Test the application
RUN npm run test

# Build the application
RUN --mount=type=cache,target=/root/.npm \
    npm run build:release

FROM node:24-trixie-slim AS app

RUN apt update \
 && DEBIAN_FRONTEND=noninteractive apt upgrade -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN npm install -g npm@latest

COPY --from=builder --chown=node:node /build/dist/ /app
COPY --chmod=u=rwx,go=rx ./entrypoint.sh /entrypoint.sh

EXPOSE 3000

VOLUME /app/data

ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "prod"]
