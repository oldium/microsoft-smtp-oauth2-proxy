# syntax=docker/dockerfile:1

FROM dhi.io/node:26-debian-dev AS builder

WORKDIR /build

# The bundled npm is a distro package, /usr/local/bin takes precedence in PATH
RUN npm install -g --prefix /usr/local npm@latest

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

FROM dhi.io/node:26-debian-dev AS tini

RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*

FROM dhi.io/node:26-debian AS app

COPY --from=tini /usr/bin/tini /usr/bin/tini

WORKDIR /app

# The app stays root-owned and read-only, only the data directory is writable
COPY --from=builder --exclude=data --chmod=u=rwX,go=rX /build/dist/ /app
COPY --from=builder --chown=1000:1000 /build/dist/data/ /app/data/

USER 1000:1000

EXPOSE 3000

VOLUME /app/data

# -s keeps zombie reaping working when Docker's --init runs as PID 1
ENTRYPOINT ["/usr/bin/tini", "-s", "--"]
CMD ["node", "--enable-source-maps", "--disable-warning=ExperimentalWarning", "./dist/bin/server.js"]
