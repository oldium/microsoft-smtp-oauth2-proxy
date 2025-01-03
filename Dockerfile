FROM node:23-alpine AS builder

WORKDIR /build

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy application files
COPY . .

# Build the application
RUN npm run build

FROM node:23-alpine AS app

RUN apk add --no-cache runuser

WORKDIR /app

COPY --from=builder --chown=node:node /build/dist/ /app
COPY ./entrypoint.sh /entrypoint.sh

EXPOSE 3000

VOLUME /app/data

ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "prod"]
