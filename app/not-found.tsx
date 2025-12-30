import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950">
            <div className="text-center p-8 max-w-lg">
                {/* 404 Badge */}
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/30 mb-8">
                    <span className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
                        404
                    </span>
                </div>

                <h1 className="text-3xl font-bold text-white mb-4">
                    Page Not Found
                </h1>

                <p className="text-zinc-400 mb-8 leading-relaxed">
                    The page you're looking for doesn't exist or has been moved.
                    Don't worry, even the best traders take wrong turns sometimes.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Link
                        href="/"
                        className="px-6 py-3 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-medium rounded-xl transition-all duration-200 shadow-lg shadow-violet-500/25"
                    >
                        Go to Home
                    </Link>
                    <Link
                        href="/support"
                        className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-xl transition-colors border border-zinc-700"
                    >
                        Contact Support
                    </Link>
                </div>

                {/* Decorative elements */}
                <div className="mt-12 flex justify-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-violet-500/50 animate-pulse" />
                    <div className="w-2 h-2 rounded-full bg-blue-500/50 animate-pulse delay-100" />
                    <div className="w-2 h-2 rounded-full bg-emerald-500/50 animate-pulse delay-200" />
                </div>
            </div>
        </div>
    );
}
