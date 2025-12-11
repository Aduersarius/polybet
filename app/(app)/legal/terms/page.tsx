import Link from 'next/link';

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] text-white">
            <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">
                <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Legal</p>
                    <h1 className="text-3xl font-bold">Terms &amp; Conditions</h1>
                    <p className="text-sm text-gray-400">Last updated: Dec 11, 2025</p>
                </div>

                <div className="space-y-6 text-gray-200 leading-relaxed">
                    <p>
                        These Terms govern your access to and use of PolyBet. By creating an account or using the
                        platform, you agree to these Terms. If you do not agree, do not use the service.
                    </p>

                    <section className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Eligibility</h2>
                        <p className="text-gray-300">
                            You must be legally permitted to participate in prediction and trading products in your
                            jurisdiction, and meet any age and KYC requirements we enforce. You are responsible for
                            complying with local laws.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Platform use</h2>
                        <ul className="list-disc list-inside text-gray-300 space-y-1">
                            <li>Keep your credentials secure; you are responsible for activity on your account.</li>
                            <li>Do not engage in fraud, market manipulation, abuse, or prohibited conduct.</li>
                            <li>We may suspend or close accounts that violate policies or legal requirements.</li>
                        </ul>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Markets & settlement</h2>
                        <p className="text-gray-300">
                            Markets, odds, and liquidity are provided on a best-effort basis. Settlement is performed
                            according to event resolution rules and administrator determinations. Payouts depend on
                            available liquidity and market outcomes.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Fees and funding</h2>
                        <p className="text-gray-300">
                            Fees, spreads, or commissions may apply to trades, deposits, or withdrawals. Network fees
                            on blockchain transactions are your responsibility.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Disclaimers</h2>
                        <p className="text-gray-300">
                            The service is provided “as is” without warranties of any kind. We do not guarantee uptime,
                            accuracy of market data, or profitability. Use at your own risk (see Risk Warning).
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Limitation of liability</h2>
                        <p className="text-gray-300">
                            To the fullest extent permitted by law, PolyBet is not liable for indirect, incidental,
                            or consequential losses, or for losses arising from market volatility, downtime, or third-party
                            providers. In any case, liability is limited to amounts you paid to use the service in the
                            12 months before the claim.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Changes</h2>
                        <p className="text-gray-300">
                            We may update these Terms. Continued use after updates means you accept the new Terms. If
                            you do not agree, stop using the platform.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h2 className="text-xl font-semibold text-white">Contact</h2>
                        <p className="text-gray-300">
                            Questions about these Terms? Email{' '}
                            <a href="mailto:contact@polybet.com" className="text-blue-400 hover:text-blue-300">contact@polybet.com</a>.
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



