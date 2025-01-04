import type { Metadata, Viewport } from "next";
import "./globals.css";
import React from "react";
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import Toaster from "./components/toaster";
import { Header } from "./components/header";
import { Footer } from "./components/footer";
import ShowToastsFromCookie from "./components/show_toasts_from_cookie";

export const metadata: Metadata = {
    title: "Microsoft SMTP OAuth2 Proxy",
    description: "Allow sending emails to Outlook.com account with username and password",
};

export const viewport: Viewport = {
    initialScale: 0.5,
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={ `${ GeistSans.variable } ${ GeistMono.variable } antialiased` }>
        <body>
        <Toaster/>
        <ShowToastsFromCookie/>
        <div
            className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <Header/>
            { children }
            <Footer/>
        </div>
        </body>
        </html>
    );
}
