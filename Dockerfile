FROM node:24-alpine AS builder

WORKDIR /build

# Copy package files and install dependencies
COPY --chmod=u=rw,go=r package*.json ./

RUN npm install -g npm@latest \
 && npm ci

# Copy application files
COPY --chmod=u=rw,go=r . .
RUN find . -mindepth 1 -maxdepth 1 -type d ! -name node_modules -exec chmod -R ugo+X {} +

# Build the application
RUN npm run build

FROM node:24-alpine AS app

RUN apk add --no-cache runuser

WORKDIR /app

RUN npm install -g npm@latest

COPY --from=builder --chown=node:node /build/dist/ /app
COPY --chmod=u=rwx,go=rx ./entrypoint.sh /entrypoint.sh

EXPOSE 3000

VOLUME /app/data

ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "prod"]
