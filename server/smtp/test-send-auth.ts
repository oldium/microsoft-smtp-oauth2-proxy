import "localenv";
import nodemailer from "nodemailer";
import emailAddresses from "email-addresses";
import SMTPConnection from "nodemailer/lib/smtp-connection";

const [hostPort, from, password, to, subject, message] = process.argv.slice(2);

if (!hostPort || hostPort.split(":").length != 2 || !from || !to || !password) {
    console.error("Usage: node --import=extensionless/register --import=@swc-node/register/esm-register test-send-auth.ts <host>:<port> <from> <password> <to> [<subject> [<message>]]");
    console.error();
    console.error("User name is taken from the <from> address");
    process.exit(1);
}

const fromAddress = emailAddresses.parseOneAddress(from);
if (!fromAddress || fromAddress.type !== "mailbox") {
    throw new Error(`Invalid from address: ${ from }`);
}

console.log(`User: ${ fromAddress.address }`);

const host = hostPort.split(":")[0];
const port = parseInt(hostPort.split(":")[1]);

const transporter = nodemailer.createTransport({
    logger: true,
    debug: true,
    host: host,
    port: port,
    auth: {
        user: fromAddress.address,
        pass: password,
    },
    secure: port === 465,
    secured: port === 25
} as SMTPConnection.Options);

console.log(`Sending test email from ${ from } to ${ to }...`);

await transporter.sendMail({
    from,
    sender: from,
    to,
    subject: subject ?? "Hello!",
    text: message ?? "Hello from your relay!",
});

console.log("Sent");
