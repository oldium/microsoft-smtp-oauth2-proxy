'use client';

import React, { memo } from "react";
import {
    default as rhtToast,
    resolveValue,
    Toast,
    Toaster as ReactHotToastToaster,
    ToasterProps
} from "react-hot-toast";
import clsx from "clsx";
import parse from "html-react-parser";
import { marked } from "marked";
import { AlertTriangle, CircleCheck, Info, OctagonX } from "lucide-react";

export type ToastType = "info" | "warning" | "error" | "success";

export function toast(type: ToastType, message: string) {
    let messageHtml = parse(marked.parse(message) as string);
    if (Array.isArray(messageHtml)) {
        messageHtml = <> { messageHtml } </>;
    }
    console.log(messageHtml);

    switch (type) {
        case "info":
            rhtToast(messageHtml, {
                className: "border-blue-900 bg-blue-50 text-gray-950 dark:border-blue-300 dark:bg-blue-950 dark:text-gray-50",
                icon: <Info className={ `h-8 w-8 text-blue-600 dark:text-blue-300` } />,
                duration: 3000
            });
            break;
        case "success":
            rhtToast(messageHtml, {
                className: "border-green-900 bg-green-50 text-gray-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-gray-50",
                icon: <CircleCheck className={ `h-8 w-8 text-green-600 dark:text-green-300` } />,
                duration: 2000
            })
            break;
        case "warning":
            rhtToast(messageHtml, {
                className: "border-yellow-900 bg-yellow-50 text-gray-950 dark:border-yellow-600 dark:bg-amber-950 dark:text-gray-50",
                icon: <AlertTriangle className={ `h-8 w-8 text-amber-600 dark:text-yellow-300` } />,
                duration: 4000
            });
            break;
        case "error":
            rhtToast(messageHtml, {
                className: "border-red-900 bg-red-50 text-gray-950 dark:border-red-600 dark:bg-red-950 dark:text-gray-50",
                icon: <OctagonX className={ `h-8 w-8 text-red-600 dark:text-red-300` } />,
                duration: 5000
            });
            break;
        default:
            rhtToast(messageHtml, {
                className: "border-gray-900 bg-gray-50 text-gray-950 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-50",
                duration: 4000
            })
            break;
    }
}

const ToastBar = memo(function ToastBar(props: { toast: Toast }) {
    const t = props.toast;
    const icon = t.icon;
    return (
        <div
            className={ clsx(
                `rounded-2xl border-2`,
                `shadow-2xl shadow-gray-600 dark:shadow-black`,
                `will-change-transform pointer-events-auto`,
                `flex items-center max-w-lg p-3 space-x-3`,
                t.visible
                    ? "motion-safe:animate-enter motion-reduce:animate-fade-in"
                    : "motion-safe:animate-leave motion-reduce:animate-fade-out",
                t.className
                ) }>
            { icon ? <div className={`shrink-0`}> { icon } </div> : null }
            <div className={ `space-y-4` }>
                { resolveValue(t.message, t) }
            </div>
        </div>
    );
});

function Toaster(props: ToasterProps) {
    return (
        <ReactHotToastToaster { ...props }>
            { (t) => (
                <ToastBar toast={ t }/>
            ) }
        </ReactHotToastToaster>
    );
}

export default memo(Toaster);
