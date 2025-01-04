"use client";

import React, { useCallback, useEffect, useState } from "react";
import { LogOut, MailX, Server, } from "lucide-react";
import UserDto from "../../../dto/user_dto";
import ReloadButton from "../components/reload_button";
import ConfigItem from "../components/config_item";
import { useRouter } from "next/navigation";
import _ from "lodash";
import UrlActionDto from "../../../dto/url_action_dto";
import ConfigItemRows from "../components/config_item_rows";
import { toast } from "../components/toaster";

export default function Configuration() {
    const portInfo = {
        portCount: parseInt(process.env.NEXT_PUBLIC_COUNT_PORTS ?? "1"),
    };

    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [config, setConfig] = useState<{
        email: string;
        smtpPorts: { port: number | string, security: string }[];
        smtpServer: string;
    }>({
        email: "",
        smtpPorts: new Array(portInfo.portCount).fill({ port: "", security: "" }),
        smtpServer: "",
    });
    const [password, setPassword] = useState("");

    useEffect(() => {
        (async () => {
                try {
                    const res = await fetch("/api/user", { cache: "no-store" });
                    const data: UserDto = await res.json();
                    if (res.status === 401) {
                        toast("info", "Session expired, please log in again");
                        router.push("/");
                    } else if (!res.ok) {
                        toast("error", "An error occurred. Please try again later.");
                    } else {
                        setConfig({
                            email: data.email,
                            smtpPorts: data.smtp_ports,
                            smtpServer: data.smtp_host,
                        });
                        setPassword(data.smtp_password);
                    }
                } catch {
                    toast("error", "An error occurred. Please try again later.");
                    setError(true);
                } finally {
                    setLoading(false);
                }
            }
        )();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const doResetPassword = useCallback(async () => {
        try {
            const res = await fetch("/api/reset", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            const data: UserDto = await res.json();
            if (!res.ok) {
                if (res.status == 401) {
                    toast("info", "Session expired, please log in again");
                    router.push("/");
                } else {
                    toast("error", "An error occurred. Please try again later.");
                }
            } else {
                toast("success", "Password changed successfully");
                setPassword(data.smtp_password);
                const newConfig = {
                    email: data.email,
                    smtpServer: data.smtp_host,
                    smtpPorts: data.smtp_ports,
                };
                if (!_.isEqual(config, newConfig)) {
                    setConfig(newConfig);
                }
            }
        } catch {
            toast("error", "An error occurred. Please try again later.");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [password, config]);

    const doCancel = useCallback(async () => {
        try {
            const res = await fetch("/auth/cancel", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            if (res.ok) {
                const data: UrlActionDto = await res.json();
                router.push(data?.url ?? "/");
            } else if (res.status === 401) {
                router.push("/");
            } else {
                toast("error", "An error occurred. Please try again later.");
            }
        } catch {
            toast("error", "An error occurred. Please try again later.");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const doLogout = useCallback(async () => {
        try {
            const res = await fetch("/auth/logout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            if (res.ok) {
                const data: UrlActionDto = await res.json();
                router.push(data?.url ?? "/");
            } else if (res.status == 401) {
                router.push("/");
            } else {
                toast("error", "An error occurred. Please try again later.");
            }
        } catch {
            toast("error", "An error occurred. Please try again later.");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <div className="mt-16 bg-white dark:bg-gray-900 rounded-2xl shadow-xl dark:shadow-gray-900 p-8">
                <div className="flex items-center space-x-3 mb-8">
                    <Server className="h-8 w-8 text-green-500"/>
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-200">
                        Your SMTP Configuration
                    </h2>
                </div>

                <div className="space-y-6" aria-hidden={ loading }>
                    <ConfigItem label="Server" loading={ loading } disabled={ loading || error }
                                value={ config.smtpServer }/>

                    <ConfigItemRows labels={ ["Port", "Security"] } rows={ config.smtpPorts }
                                    disabled={ loading || error } loading={ loading }
                                    valuesMapper={ useCallback((row: {
                                        port: number | string,
                                        security: string
                                    }) => [row.port, row.security], []) }
                                    gridClassName="grid-cols-2"
                    />

                    <ConfigItem label="Username" loading={ loading } disabled={ loading || error }
                                value={ config.email }/>
                    <ConfigItem label="Password" loading={ loading } disabled={ loading || error }
                                value={ password }>
                        <ReloadButton onClick={ doResetPassword } disabled={ loading || error }/>
                    </ConfigItem>
                </div>

                <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-50 mb-2">
                        Next Steps
                    </h2>
                    <ol className="list-decimal list-inside space-y-2 text-blue-800 dark:text-blue-200">
                        <li>Go to your SMTP client settings.</li>
                        <li>Add your Outlook.com email using the SMTP settings above.</li>
                    </ol>
                </div>
            </div>

            <div className="mt-8 pt-8 flex justify-center space-x-8 items-center">
                <button
                    className="inline-flex items-center px-8 py-4 border border-transparent text-lg font-medium rounded-xl text-white bg-red-500 hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-800 transition-all duration-200 hover:scale-105"
                    onClick={ doCancel }
                    disabled={ loading }
                >
                    Cancel
                    <MailX className="ml-3 h-5 w-5"/>
                </button>
                <button
                    className="inline-flex items-center px-8 py-4 border border-transparent text-lg font-medium rounded-xl text-white bg-sky-500 hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-800 transition-all duration-200 hover:scale-105"
                    onClick={ doLogout }
                    disabled={ loading }
                >
                    Sign out
                    <LogOut className="ml-3 h-5 w-5"/>
                </button>
            </div>
        </>
    );
}
