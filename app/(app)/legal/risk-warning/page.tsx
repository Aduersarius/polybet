import Link from 'next/link';
import { Navbar } from '../../../components/Navbar';
import { Footer } from '../../../components/Footer';

export default function RiskWarningPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
            <Navbar />
            <main className="flex-1">
                <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">
                    <div className="space-y-3">
                        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-blue-300 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
                            Legal
                            <span className="text-[10px] text-gray-300">Risk Warning</span>
                        </p>
                        <h1 className="text-4xl font-bold">Risk Warning</h1>
                        <p className="text-sm text-gray-400">Last updated: Dec 11, 2025</p>
                    </div>

                    <div className="space-y-6 text-gray-200 leading-relaxed bg-white/5 border border-white/10 rounded-2xl p-6 shadow-lg">
                        <p>
                            Trading and prediction markets involve risk. Prices can move quickly and you may lose some or
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

                        <section className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Support</h2>
                            <p className="text-gray-300">
                                For questions about platform risk, reach us at{' '}
                                <a href="mailto:contact@pariflow.com" className="text-blue-400 hover:text-blue-300">contact@pariflow.com</a>.
                            </p>
                        </section>

                        <div className="pt-4">
                            <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm">Back to home</Link>
                        </div>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
}
