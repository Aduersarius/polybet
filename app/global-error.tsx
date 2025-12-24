"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <html>
            <body>
                <div className="min-h-screen flex items-center justify-center bg-zinc-950">
                    <div className="text-center p-8 max-w-md">
                        <h1 className="text-4xl font-bold text-white mb-4">
                            Something went wrong
                        </h1>
                        <p className="text-zinc-400 mb-6">
                            We've been notified and are working to fix this issue.
                        </p>
                        <button
                            onClick={() => reset()}
                            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
