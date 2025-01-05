# Microsoft SMTP OAuth2 Proxy for Next.js

This is a [Next.js](https://nextjs.org) project providing a proxy server to
allow connecting to Microsoft SMTP servers using basic authentication.

## Quick Start

This project is developed with Node.js version 23, Next.js 15.1 and React 19. It
uses custom entrypoint to start both the SMTP server and the web server.

First, install the dependencies:

```bash
npm install
```

Then configure the server. Look at the `env.example` and copy it to `env`. The
project does not use dot-env file (`.env`), because it is automatically picked
by Next.js and included in the build, which is not desired. The minimal
configuration looks like this:

`env`:

```dotenv
APP_SECRETS=will-configure:later
SESSION_SECRET=my-session-secret
SMTP_PUBLIC_HOST=smtp.example.com
SMTP_PORT=25
```

To generate the session secret, you can use
[1password online service][onepass-online]. The session secret is used to
encrypt the session cookie. Minimum of 32 characters gives you enough entropy
for the encryption (at least for now). You can use special characters, but read
the example documentation carefully on how to write it in the `env` file.

Then, run the development server:

```bash
npm run dev
```

You should be able to open the web interface on
[http://localhost:3000][localhost-3000].

The Microsoft login will not work, this needs a
[special setup](#microsoft-oauth2-setup).

[onepass-online]: https://1password.com/password-generator

[localhost-3000]: http://localhost:3000

## Microsoft OAuth2 Setup

You need to have [Azure Microsoft account][create-azure], the free one is
enough.

> [!CAUTION]
> The Azure portal is available also without subscription, it shows the
> Azure AD B2C directory, but this is not suitable for the OAuth2
> authentication. You will not be able to configure the application registration
> to use Personal Microsoft accounts.

> [!TIP]
> If you decide to create Azure Microsoft account, it requires a credit card.
> But do not worry, using OAuth2 authentication is free, so you will not be
> charged (unless you use some non-free Azure services of course). Before the
> free-trial month ends, you will receive an email asking to upgrade and account
> to continue using it, so if you select <q>Pay as you go</q> option, you will
> continue using OAuth2 authentication for free.

In order to register the application, do the following:

1. Login to the [Azure portal][azure-portal].
2. Open <q>App registrations</q> service (you can find it in the search bar).
3. Click on <q>New registration</q> button.
4. Fill-in the name, which will be shown on the User Consent screen during
   login. Select <q>Personal Microsoft accounts only</q> as the personal
   account type. Keep redirect URI empty, we will configure it later.
5. Note the <q>Application (client) ID</q> on the <q>Overview</q> page, this is
   the `application-id` referred in the `env` example file.
6. Go to <q>Certificates & secrets</q> and create a new client secret. Note the
   secret <q>Value</q> (not the ID), this is the `secret` referred in the `env`
   example file. You can have one secret for development and one for production.
   Azure supports up to 2 secrets per application.
7. Go to <q>API permissions</q> and add <q>Microsoft Graph</q> API with
   <q>SMTP.Send</q> permission. This is needed to send emails using the OAuth2
   authentication.
8. Go to <q>Authentication</q> and add a new platform. Select <q>Web</q> and
   fill-in the redirect URI. For development, it is
   `http://localhost:3000/auth`. For production, it is
   `https://smtp.example.com/auth` (use your domain).

> [!IMPORTANT]
> The redirect URI is used to redirect the user back to the application after
> the login. It is important to configure it correctly, otherwise the login will
> not work. The redirect URI must be HTTPS for production (more precisely for
> any non-localhost address), otherwise the login will not work. The host part
> of the URI is constructed by the application from the requests, so it is
> necessary that the `Host:` HTTP header is correct or that the `X-Forwarded-*:`
> proxy headers are set correctly. The proxy headers `X-Forwarded-*:` have
> precedence over the `Host:` header.

> [!TIP]
> One common gotcha is that you have http://localhost:3000/auth in the redirect
> URI, but you opened the web interface on http://127.0.0.1:3000, so the
> redirect URI created by application is http://127.0.0.1:3000/auth. The host
> part of the URI must match exactly the one in the redirect URI, so the login
> will not work. The easiest fix for this is to include both redirect URIs in
> the setup.

[create-azure]: https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account

[azure-portal]: https://portal.azure.com

## Testing the SMTP Proxy Locally

The SMTP proxy can be tested using the internal tools or by [Swiss Army Knife
SMTP][swaks-web] (`swaks`).

### test-send-db tool

This tool uses the SQLite database and SMTP proxy configuration to send the
email.

```bash
node --import=extensionless/register --import=@swc-node/register/esm-register \
  server/smtp/test-send-db.ts <from> <to>
```

The `<from>` is either an email address, or a user name and the email address
in the form `User Name <email@example.com>`. The `<to>` is in the same format
at the `<from>`. The SQLite database will be checked for the sending user and
his credentials will be used for the authentication.

### test-send-auth tool

This tool does not use any internal configuration, it just acts as a SMTP
client, which wants to send an email.

```bash
node --import=extensionless/register --import=@swc-node/register/esm-register \
  server/smtp/test-send-auth.ts localhost:<port> \
  <from> <password> <to> [<subject> [<message>]]
```

For the `<port>` value use `SMTP_PORT` value from the configuration (or other
configured port number like `SMTP_TLS_PORT` or `SMTP_STARTTLS_PORT`). The used
protocol is determined by the port number – 25 is unsecured, 465 is SSL/TLS and
587 is STARTTLS. The `<from>` is the email address of the sender and at the same
time email user for authentication, the `<password>` is the password. The `<to>`
is the email address of the receiver. The `<subject>` and `<message>` are
optional, the default values are used if not provided.

### Swiss Army Knife SMTP (`swaks`)

The `swaks` tool is a powerful SMTP client, which can be used to test the SMTP
server. For installation see project [web pages][swaks-web], for usage see
generated [help documentation][swaks-doc].

The following command sends an email via an unprotected port:

```bash
swaks --auth PLAIN --auth-user <email> --auth-password <password> \
  --server localhost --port <port> \
  --ehlo "[127.0.0.1]" \
  --from <email> --to <email> \
  --header "Subject: Test email" --body "This is a test email."
```

For the `<port>` value use `SMTP_PORT` value from the configuration (if
configured). The `<email>` is purely the email address used for authentication,
`<password>` is the password. The `<from>` and `<to>` are the email addresses of
the sender and the receiver, respectively, without the name part. If you want to
use the name part, additionally supply the header `From:` and/or `To:` by using
the `--header "From: User Name <email@example.com>"` format.

To test SSL/TLS, use `SMTP_TLS_PORT` and the following options:

```bash
swaks --auth PLAIN --auth-user <email> --auth-password <password> \
  --server localhost --port <port> \
  --tls-on-connect --tls-sni smtp.example.com --tls-verify \
  --ehlo "[127.0.0.1]" \
  --from <email> --to <email> \
  --header "Subject: Test email" --body "This is a test email."
```

The `--tls-sni` option controls which SSL certificate is requested (there is
only one) and `--tls-verify` option checks the certificate. The
`--tls-on-connect` option is used to start the SSL/TLS connection immediately.
The rest of the options are the same as for the unprotected connection.

To test STARTTLS, use `SMTP_STARTTLS_PORT` and the following options:

```bash
swaks --auth PLAIN --auth-user <email> --auth-password <password> \
  --server localhost --port <port> \
  --tls --tls-sni smtp.example.com --tls-verify \
  --ehlo "[127.0.0.1]" \
  --from <email> --to <email> \
  --header "Subject: Test email" --body "This is a test email."
```

The `--tls` option is used to start the STARTTLS connection immediately, the
rest of the options are the same as for the SSL/TLS connection.

> [!NOTE]
> The `--ehlo` option is used to set the SMTP `EHLO` string, which is used to
> identify the client to the server. The `swaks` tool uses the local host name,
> which is not always a valid host name. The `[127.0.0.1]` value is a correctly
> encoded and accepted IP address, although it is not reachable from the server.

[swaks-web]: https://jetmore.org/john/code/swaks/

[swaks-doc]: https://github.com/jetmore/swaks/blob/develop/doc/base.pod

## Production Build

### Manual Build

To build the production version of the application, run:

```bash
npm run build
```

This will create a production build in the `dist` directory. The application
can then be started with:

```bash
cd dist
npm run prod
```

This expects that the correct environment variables are set for the production.
Either modify the generated `env` file (it contains few mandatory values to
setup production), or simply ensure that the environment variables are set
before the command is executed. This is suitable especially for the Docker
environment.

### Docker Build

To build the Docker image, run:

```bash
docker build -t microsoft-smtp-oauth2-proxy .
```

This will create a Docker image with the name `microsoft-smtp-oauth2-proxy`. The
image can be started with:

```bash
docker run -p 80:3000 -p 465:465 -p 587:587 \
  -v proxy-config:/app/data -v ./certs:/app/certs \
  -e APP_SECRETS=my-app-id:my-secret -e SESSION_SECRET=my-session-secret \
  -e SMTP_KEY_FILE=certs/smtp_key.pem -e SMTP_CERT_FILE=certs/smtp_cert.pem \
  -e SMTP_PUBLIC_HOST=smtp.example.com \
  -e SMTP_TLS_PORT=465 -e SMTP_STARTTLS_PORT=587 \
  microsoft-smtp-oauth2-proxy
```

This starts the application with the following features:

* Web server listens on port 80.
* The SMTP server listens on 465 (SSL/TLS) and 587 (STARTTLS) ports.
* The certificates `smtp_key.pem` and `smtp_cert.pem` (in PEM format) are taken
  from the local `./certs` directory.
* The SQLite database is stored in the Docker volume named `proxy-config`.

If you have reverse proxy with SSL/TLS termination, like
[HAProxy](https://www.haproxy.org/), you can omit the certificates and forward
the traffic to the `SMTP_PORT`:

```bash
docker run -p 80:3000 -p 25:25 \
  -v proxy-config:/app/data \
  -e APP_SECRETS=my-app-id:my-secret -e SESSION_SECRET=my-session-secret \
  -e SMTP_PUBLIC_HOST=smtp.example.com \
  -e SMTP_PORT=25 \
  microsoft-smtp-oauth2-proxy
```

Then you can configure the proxy to forward the decrypted (non-SSL) traffic to
the SMTP server's port 25. In that case you would need something like
[go-mmproxy][go-mmproxy] to restore the original IP address in logs –
[see below](#real-ip-addresses-with-haproxy-as-reverse-proxy).

[go-mmproxy]: https://github.com/path-network/go-mmproxy

### Docker Compose

The following `docker-compose.yml` file can be used to start the application:

```yaml
services:
  smtp-proxy:
    restart: always
    image: microsoft-smtp-oauth2-proxy
    volumes:
      - ./data:/app/data
      - ./certs:/app/certs
    environment:
      APP_SECRETS: "my-app-id:my-secret"
      SESSION_SECRET: "my-session-secret"
      SMTP_KEY_FILE: "certs/smtp_key.pem"
      SMTP_CERT_FILE: "certs/smtp_cert.pem"
      SMTP_PUBLIC_HOST: smtp.example.com
      SMTP_TLS_PORT: 465
      SMTP_STARTTLS_PORT: 587
    ports:
      - "80:3000"
      - "465:465"
      - "587:587"
```

This is the same as the manual Docker run command, but in the Docker Compose.

### Real IP Addresses with HAProxy as Reverse Proxy

We will use Docker Compose for this setup. Let's have some assumptions:

* HAProxy is already up and running. The configuration shown here is only for
  the SMTP service, so the rest of the configuration is omitted.
* The SMTP proxy will share the network with HAProxy, so the SMTP proxy will
  be reachable by the HAProxy service by name.

#### HAProxy Configuration

The HAProxy configuration for SMTP proxy looks like this:

```text
frontend smtp-ssl-port
        mode tcp
        bind :465 ssl crt smtp.example.com.pem
        option logasap

        acl ACL_smtp_ssl ssl_fc_sni -i smtp.example.com

        tcp-request inspect-delay 2s
        tcp-request content reject if !ACL_smtp_ssl
        use_backend smtp if ACL_smtp_ssl

backend smtp
        mode tcp
        server smtp-proxy smtp-proxy:5025 send-proxy-v2
```

This will forward the incoming SSL/TLS traffic to the SMTP proxy to port 5025
after decrypting the traffic and the communication will start with the
[PROXY v2][proxy-proto] header containing the actual remote IP address.

> [!HINT]
> If you are forwarding HTTP traffic to the SMTP proxy via HAProxy, ensure that
> the backend section contains the X-Forwarded-* headers:
>
> ```text
> backend http-smtp
>         mode http
>         option forwardfor
>         http-response set-header Strict-Transport-Security max-age=63072000
>         http-request set-header X-Forwarded-Port %[dst_port]
>         http-request add-header X-Forwarded-Proto https
>         http-request add-header X-Forwarded-Ssl on
>         server smtp-http smtp-proxy:3000
> ```

[proxy-proto]: https://www.haproxy.org/download/2.4/doc/proxy-protocol.txt

#### The go-mmproxy Configuration

We need to ensure that `go-mmproxy` listens for the connections. For details
check the [GitHub page][go-mmproxy] and especially Cloudflare's Blog post
about [mmproxy configuration][cloudflare-mmproxy]. Here is the updated Docker
Compose configuration for the SMTP proxy:

```yaml
services:
  smtp-proxy:
    restart: always
    image: microsoft-smtp-oauth2-proxy
    volumes:
      - ./data:/app/data
    environment:
      APP_SECRETS: "my-app-id:my-secret"
      SESSION_SECRET: "my-session-secret"
      SMTP_PUBLIC_HOST: smtp.example.com
      SMTP_PORT: 25
    ports:
      - "80:3000"
    networks:
      - haproxy
  mmproxy:
    build:
      context: .
      dockerfile: ./mmproxy-Dockerfile
    restart: always
    cap_add:
      - NET_ADMIN
    command: [ "-l", "0.0.0.0:5025", "-4", "127.0.0.1:25", "-6", "[::1]:25", "-v", "1" ]
    sysctls:
      - net.ipv4.ip_nonlocal_bind=1
      - net.ipv4.conf.all.route_localnet=1
      - net.ipv4.conf.default.route_localnet=1
      - net.ipv4.conf.eth0.route_localnet=1
      - net.ipv4.tcp_rfc1337=1
      - net.ipv4.tcp_sack=0
      - net.ipv4.tcp_dsack=0
      - net.ipv4.tcp_fack=0
      - net.ipv4.tcp_slow_start_after_idle=0
    network_mode: "service:smtp-proxy"
    depends_on:
      smtp-proxy:
        condition: service_started
networks:
  haproxy:
    external: true
    name: haproxy_services
```

This expects that the HAProxy's Docker Compose project name is `haproxy` (that
is the name of the parent folder of the corresponding
`docker-compose.yaml` file or a `COMPOSE_PROJECT_NAME` environment variable
value) and the network inside is named `services`, thus the name
`haproxy_services`. If that is not the case, update the configuration.

You also need the following `mmproxy-Dockerfile` file:

```yaml
FROM debian:bookworm-slim

RUN apt-get update \
        && DEBCONF_NOWARNINGS="yes" DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends apt-utils \
        && DEBIAN_FRONTEND=noninteractive \
        apt-get install -y --no-install-recommends \
                go-mmproxy \
                iptables \
                iproute2 \
        && apt-get clean

COPY --chmod=775 ./mmproxy-entrypoint.sh /entrypoint.sh
ENTRYPOINT [ "/entrypoint.sh" ]
```

and the `mmproxy-entrypoint.sh` entrypoint:

```bash
#!/bin/sh
iptables -t mangle -I PREROUTING -m mark --mark 123 -m comment --comment mmproxy -j CONNMARK --save-mark
ip6tables -t mangle -I PREROUTING -m mark --mark 123 -m comment --comment mmproxy -j CONNMARK --save-mark
iptables -t mangle -I OUTPUT -m connmark --mark 123 -m comment --comment mmproxy -j CONNMARK --restore-mark
ip6tables -t mangle -I OUTPUT -m connmark --mark 123 -m comment --comment mmproxy -j CONNMARK --restore-mark
ip rule add fwmark 123 lookup 100
ip -6 rule add fwmark 123 lookup 100
ip route add local 0.0.0.0/0 dev lo table 100
ip -6 route add local ::/0 dev lo table 100

exec /usr/bin/go-mmproxy -mark 123 "$@"
```

After that you can spin-up the service with `docker compose up --detach` and
enjoy.

[cloudflare-mmproxy]: https://blog.cloudflare.com/mmproxy-creative-way-of-preserving-client-ips-in-spectrum/

## About the Project

### Why?

Microsoft SMTP servers require modern OAuth2 authentication for personal
accounts since [1.&thinsp;1.&thinsp;2023][ms-basic-disabled], but the
authentication model might not be supported by all SMTP clients, especially the
command-line ones. Even Gmail&apos;s <q>Send mail as</q> feature does not
feature a built-in support for OAuth2 authentication, so a proxy server is
needed to bypass the unsupported authentication model.

[ms-basic-disabled]: https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/deprecation-of-basic-authentication-exchange-online

### Why SMTP?

This project started as a fork of [Gmail to Outlook proxy][gtop] for personal
use. But the original project suffers from few issues because of the email
sending API it uses – it does not keep the original sender&apos;s name and does
not support Blind Carbon Copy (BCC) receivers. This project aims to fix these
issues by going back to the basics and using the SMTP protocol directly.

[gtop]: https://github.com/jasperchan/gmail-to-outlook-proxy

### Why Next.js?

I decided to keep the same frameworks as the original project to learn something
about Node.js and Next.js (thus the similar look-and-feel). I needed to learn
the following:

* SMTP Protocol and its extensions, like STARTTLS, AUTH, chunking (BDAT),
  pipelining etc. I got a lot of information from Nodemailer implementation
  of [client][nodemailer-client] and [server][nodemailer-server].
* TypeScript, Node.js and handling of asynchronous network operations. Spoiler:
  the biggest discovery was that all network callbacks are made inside a
  `process.nextTick()` callback. After that the implementation went like a
  breeze.
* React – I had some basics from Udemy courses, but never used it actually.
* Next.js – nice and fast framework (with Turbopack) doing a lot of things for
  you.

[nodemailer-client]: https://github.com/nodemailer/nodemailer

[nodemailer-server]: https://github.com/nodemailer/smtp-server

### How?

The SMTP server implementation started from Gemini 2.0 code, which I completely
rewrote. But it was really good to have some starting point, it felt like a code
from a medior software engineer with some junior habits 😅.
