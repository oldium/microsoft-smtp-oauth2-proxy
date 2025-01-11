import "localenv";
import nodemailer from "nodemailer";
import { endDb, getDbUserByEmail } from "../lib/db";
import config from "../lib/config";
import emailAddresses from "email-addresses";
import SMTPConnection from "nodemailer/lib/smtp-connection";
import assert from "node:assert";

const [from, to] = process.argv.slice(2);

if (!from || !to) {
    console.error("Usage: node --import=extensionless/register --import=@swc-node/register/esm-register test-send-db.ts <from> <to>");
    process.exit(1);
}

const fromAddress = emailAddresses.parseOneAddress(from);
if (!fromAddress || fromAddress.type !== "mailbox") {
    throw new Error(`Invalid from address: ${ from }`);
}

console.log(`User: ${ fromAddress.address }`);
const user = await getDbUserByEmail(fromAddress.address);
await endDb();

if (!user) {
    throw new Error(`User ${ from } not found.`);
}

const transporter = nodemailer.createTransport({
    logger: true,
    debug: true,
    host: "localhost",
    port: config.smtp.server.smtp
        ? config.smtp.server.smtp.serverOptions.ports![0]
        : config.smtp.server.smtpTls
            ? config.smtp.server.smtpTls.serverOptions.ports![0]
            : config.smtp.server.smtpStartTls
                ? config.smtp.server.smtpStartTls.serverOptions.ports![0]
                : assert(false, "No listening port"),
    auth: {
        user: user.email,
        pass: user.smtpPassword,
    },
    secure: config.smtp.server.smtp
        ? false
        : config.smtp.server.smtpTls
            ? true
            : config.smtp.server.smtpStartTls
                ? false
                : assert(false, "No listening port"),
    secured: config.smtp.server.smtp
        ? true
        : config.smtp.server.smtpTls
            ? false
            : config.smtp.server.smtpStartTls
                ? false
                : assert(false, "No listening port"),
    ignoreTLS: config.smtp.server.smtp
        ? true
        : config.smtp.server.smtpTls
            ? true
            : config.smtp.server.smtpStartTls
                ? false
                : assert(false, "No listening port"),
    tls: {
        rejectUnauthorized: false,
    },
} as SMTPConnection.Options);

console.log(`Sending test email from ${ from } to ${ to }...`);

await transporter.sendMail({
    from,
    sender: from,
    to,
    subject: "Hello!",
    text: "Hello from your relay!",
});

console.log("Sent");
