import React from "react";
import { Server, } from "lucide-react";
import ServerConnectionConfig from "../components/server_connection_config";
import AuthConfig from "../components/auth_config";
import AuthActions from "../components/auth_actions";

export const dynamic = "force-dynamic";

export default function Configuration() {
    return (
        <>
            <div className="mt-16 bg-white dark:bg-gray-900 rounded-2xl shadow-xl dark:shadow-gray-900 p-8">
                <div className="flex items-center space-x-3 mb-8">
                    <Server className="h-8 w-8 text-green-500"/>
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-200">
                        Your SMTP Configuration
                    </h2>
                </div>

                <div className="space-y-6">
                    <ServerConnectionConfig/>
                    <AuthConfig/>
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
                <AuthActions/>
            </div>
        </>
    );
}
