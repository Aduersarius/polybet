import Link from 'next/link';
import { Navbar } from '../../../components/Navbar';
import { Footer } from '../../../components/Footer';

export default function PrivacyPolicyPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
            <Navbar />
            <main className="flex-1">
                <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">
                    <div className="space-y-3">
                        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-blue-300 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
                            Legal
                            <span className="text-[10px] text-gray-300">Privacy Policy</span>
                        </p>
                        <h1 className="text-4xl font-bold">Privacy Policy</h1>
                        <p className="text-sm text-gray-400">Last updated: Dec 11, 2025</p>
                    </div>

                    <div className="space-y-6 text-gray-200 leading-relaxed bg-white/5 border border-white/10 rounded-2xl p-6 shadow-lg">
                        <p>
                            This Privacy Policy explains how Pariflow collects, uses, and protects personal data when you
                            use our prediction and trading platform. By using Pariflow, you consent to these practices.
                        </p>

                        <section className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Data we collect</h2>
                            <ul className="list-disc list-inside text-gray-300 space-y-1">
                                <li>Account data: username, email, and optional profile details you provide.</li>
                                <li>Session and security data: auth tokens, device info, IP, and logs to prevent abuse.</li>
                                <li>Usage data: bets, positions, deposits/withdrawals, and feature interactions.</li>
                                <li>Payments and blockchain data: wallet addresses and on-chain activity tied to your account.</li>
                            </ul>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">How we use data</h2>
                            <ul className="list-disc list-inside text-gray-300 space-y-1">
                                <li>Operate core features: account access, markets, orders, balances, and notifications.</li>
                                <li>Security and compliance: fraud prevention, risk controls, abuse detection, and audits.</li>
                                <li>Product improvement: performance monitoring, feature analytics, and support.</li>
                                <li>Communications: transactional emails, important updates, and required notices.</li>
                            </ul>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Sharing</h2>
                            <p className="text-gray-300">
                                We share data only with trusted processors (e.g., infrastructure, payments, analytics)
                                under contractual safeguards. We do not sell personal data.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Retention</h2>
                            <p className="text-gray-300">
                                We retain data while your account is active and as needed for legal, regulatory, and
                                accounting purposes. You may request deletion where permitted, but some records must be
                                kept to meet compliance obligations.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Your choices</h2>
                            <ul className="list-disc list-inside text-gray-300 space-y-1">
                                <li>Update profile details in your account settings.</li>
                                <li>Control cookies in your browser (see Cookie Policy).</li>
                                <li>Request data access or deletion where allowed by law.</li>
                            </ul>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Security</h2>
                            <p className="text-gray-300">
                                We apply industry-standard security controls, encryption in transit, access limits, and
                                monitoring. No system is perfect—protect your credentials and report suspected issues promptly.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Contact</h2>
                            <p className="text-gray-300">
                                Privacy questions? Reach us at{' '}
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



