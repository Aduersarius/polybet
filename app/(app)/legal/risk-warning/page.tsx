import Link from 'next/link';

export default function RiskWarningPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] text-white">
            <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">
                <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Legal</p>
                    <h1 className="text-3xl font-bold">Risk Warning</h1>
                    <p className="text-sm text-gray-400">Last updated: Dec 11, 2025</p>
                </div>

                <div className="space-y-6 text-gray-200 leading-relaxed">
                    <p>
                        Trading on prediction markets involves risk. Prices can move quickly and you may lose some or
                        all of the funds you commit. Only trade with money you can afford to lose.
                    </p>

                    <section className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Market and liquidity risk</h2>
                        <p className="text-gray-300">
                            Markets may be thinly traded. You may not be able to exit positions at desired prices or in
                            the size you want. Event outcomes can create abrupt price changes and slippage.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Event and settlement risk</h2>
                        <p className="text-gray-300">
                            Event rules and data sources determine settlement. Disputes or ambiguity can delay or change
                            resolution. Administrator determinations are final once published.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Operational risk</h2>
                        <p className="text-gray-300">
                            System outages, latency, or third-party provider failures can affect order placement,
                            matching, or settlement. Network fees and on-chain congestion can impact costs and timing.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Regulatory considerations</h2>
                        <p className="text-gray-300">
                            Availability depends on your jurisdiction. Laws may change, which could limit access,
                            require additional verification, or restrict certain markets.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Personal responsibility</h2>
                        <p className="text-gray-300">
                            You are responsible for understanding each market, your own financial situation, and for
                            managing your risk. Consider independent advice if needed.
                        </p>
                    </section>

                    <div className="pt-4">
                        <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm">Back to home</Link>
                    </div>
                </div>
            </div>
        </main>
    );
}



