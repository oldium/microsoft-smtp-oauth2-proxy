import React from "react";
import { AlertTriangle, ArrowRight, Server, ShieldX } from "lucide-react";
import GitHub from "./icons/github";
import Microsoft from "./icons/microsoft";
import { ServerProtoConfig } from "./components/server_proto_config";

export const dynamic = "force-dynamic";

export default function Home() {
    return (
        <>
            <div className="mt-16 bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8">
                <div className="flex items-start space-x-4">
                    <ShieldX className="h-6 w-6 text-red-600 dark:text-red-500 flex-shrink-0 mt-1"/>
                    <div className="pr-10">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-200 mb-4">
                            The Issue
                        </h2>
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                            Microsoft has disabled basic authentication for personal Outlook accounts on Microsoft
                            Outlook SMTP servers in favor of OAuth 2.0. This change affects sending and forwarding
                            emails from custom services and public ones like Gmail&apos;s <q>Send mail as</q> feature.
                            Authenticating with basic authentication against the Outlook server
                            like <code>smtp-mail.outlook.com</code> or <code>smtp.office365.com</code> results in the
                            following error:
                        </p>
                        <p className="text-red-600 dark:text-red-300 leading-relaxed mt-4">
                            <code>
                                535 5.7.139 Authentication unsuccessful, basic authentication is disabled.
                            </code>
                        </p>
                    </div>
                </div>

                <div className="mt-12 flex items-start space-x-4">
                    <Server className="h-6 w-6 text-green-500 dark:text-green-400 flex-shrink-0 mt-1"/>
                    <div className="pr-10 text-gray-600 dark:text-gray-200">
                        <h2 className="text-2xl font-semibold mb-4">
                            The Solution
                        </h2>
                        <p className="text-gray-600 leading-relaxed">
                            <a
                                rel="noopener"
                                className="inline-flex gap-1 items-center px-4 py-2 border border-transparent text-lg
                                font-medium rounded-xl text-white dark:text-gray-100 bg-black focus:outline-none
                                focus:ring-2 focus:ring-offset-2 focus:ring-black transition-all duration-200
                                hover:scale-105"
                                href="https://github.com/oldium/microsoft-smtp-oauth2-proxy"
                                target="_blank"
                            >
                                <GitHub className="h-5 w-5 mr-3 fill-white"/>
                                GitHub (For Self-Hosting)
                            </a>
                        </p>
                        <p className="leading-relaxed mt-4">
                            The proxy acts as a standard secure SMTP server with SSL/TLS and/or STARTTLS secure
                            communication and with basic authentication (see configuration page after logging in for
                            credentials). The proxy connects to Microsoft Outlook SMTP server and authenticates the user
                            with modern OAuth2 authentication.
                        </p>
                        <ul className="leading-relaxed list-disc pl-6 mt-4">
                            <li>
                                Accepts connection from standard SMTP client
                            </li>
                            <li>
                                Securely handles the authentication and transmission process
                                using TLS encryption
                            </li>
                            <li>
                                Forwards all SMTP commands to Microsoft SMTP server
                            </li>
                        </ul>
                        <p className="leading-relaxed mt-4">
                            The current configuration exposes the following protocols:
                        </p>
                        <ul className="leading-relaxed list-disc pl-6 mt-4">
                            <ServerProtoConfig />
                        </ul>
                    </div>
                </div>

                <div className="mt-12 flex items-start space-x-4">
                    <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0 mt-1"/>
                    <div className="pr-10">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-200 mb-4">
                            The Permissions
                        </h2>
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                            The service requests <code>SMTP.Send</code> permission in order to forward SMTP requests
                            to the Microsoft SMTP server. It also requests to read user profile in order to know
                            the user account email for basic authentication. Revoke this limited permissions at any time
                            via{ " " }
                            <a
                                className={ "underline text-blue-600 dark:text-blue-400" }
                                rel="noopener"
                                href="https://account.microsoft.com/privacy/app-access"
                                target="_blank"
                            >
                                https://account.microsoft.com/privacy/app-access
                            </a>
                            .
                        </p>
                        <p className="mt-4 text-yellow-700 dark:text-yellow-200 leading-relaxed">
                            Be careful who you grant permission to, as this permission gives the requester the ability
                            to send emails on your behalf.
                        </p>
                    </div>
                </div>

                <div className="mt-8 flex flex-col items-center">
                    <a
                        className="inline-flex items-center px-8 py-4 border border-transparent text-lg font-medium
                        rounded-xl text-white bg-[#05a6f0] hover:bg-[#0490d3] focus:outline-none focus:ring-2
                        focus:ring-offset-2 focus:ring-[#05a6f0] transition-all duration-200 hover:scale-105"
                        href="/auth"
                    >
                        <Microsoft className="h-7 w-7 mr-3"/>
                        Sign in with Microsoft
                        <ArrowRight className="ml-3 h-5 w-5"/>
                    </a>
                    <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                        Secure authentication through Microsoft&apos;s official OAuth 2.0 Authorization Code Flow
                    </p>
                </div>
            </div>
        </>
    );
}
