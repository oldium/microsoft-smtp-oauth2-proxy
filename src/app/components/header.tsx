import { SendHorizonal } from "lucide-react";
import Link from "next/link";
import Gmail from "../icons/gmail";
import Outlook from "../icons/outlook";

export function Header() {
    return (
        <div className="text-center">
            <div className="flex justify-center mb-6">
                <Link href="/" className="flex items-center gap-2">
                    <Gmail className="w-16 h-16"/>
                    <div className="w-4 border-t-4 border-dotted border-gray-300"/>
                    <SendHorizonal
                        className="stroke-gray-300"
                        height={ 32 }
                        width={ 32 }
                        strokeWidth={ 2 }
                        absoluteStrokeWidth={ true }
                    />
                    <div className="w-4 border-t-4 border-dotted border-gray-300"/>
                    <Outlook className="w-16 h-16"/>
                </Link>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-200 sm:text-5xl mb-6">
                Microsoft SMTP OAuth2 Proxy
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
                Restore basic authentication with Microsoft SMTP servers for your account
            </p>
        </div>
    );
}
