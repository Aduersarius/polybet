import Link from 'next/link';
import { Navbar } from '../../../components/Navbar';
import { Footer } from '../../../components/Footer';

export default function CookiePolicyPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
            <Navbar />
            <main className="flex-1">
                <div className="max-w-5xl mx-auto px-4 py-12 space-y-8">
                    <div className="space-y-3">
                        <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-blue-300 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
                            Legal
                            <span className="text-[10px] text-gray-300">Cookie Policy</span>
                        </p>
                        <h1 className="text-4xl font-bold">Cookie Policy</h1>
                        <p className="text-sm text-gray-400">Last updated: Dec 11, 2025</p>
                    </div>

                    <div className="space-y-6 text-gray-200 leading-relaxed bg-white/5 border border-white/10 rounded-2xl p-6 shadow-lg">
                        <p>
                            PolyBet uses cookies and similar technologies to run the platform, keep you signed in,
                            protect your account, and improve performance. This notice explains what we use and how
                            you can manage your choices.
                        </p>

                        <section className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">What we collect</h2>
                            <ul className="list-disc list-inside text-gray-300 space-y-1">
                                <li>Essential cookies for authentication, session continuity, and security checks.</li>
                                <li>Preference cookies for language, theme, and trading display settings.</li>
                                <li>Analytics cookies (aggregate, non-identifying) to monitor reliability and UX.</li>
                            </ul>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Why we use them</h2>
                            <ul className="list-disc list-inside text-gray-300 space-y-1">
                                <li>Keep you logged in securely and prevent unauthorized access.</li>
                                <li>Remember your preferences to simplify repeated visits.</li>
                                <li>Measure stability, latency, and feature adoption to improve the product.</li>
                            </ul>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Your choices</h2>
                            <p className="text-gray-300">
                                You can disable non-essential cookies via your browser settings. Blocking essential
                                cookies may break sign-in or core trading flows. If you use multiple devices, set your
                                preference on each device.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Third parties</h2>
                            <p className="text-gray-300">
                                We rely on trusted infrastructure and analytics providers. They receive only the data
                                needed to deliver their service and are bound by contractual and security controls.
                            </p>
                        </section>

                        <section className="space-y-2">
                            <h2 className="text-xl font-semibold text-white">Contact</h2>
                            <p className="text-gray-300">
                                Questions about cookies? Reach us at{' '}
                                <a href="mailto:contact@polybet.com" className="text-blue-400 hover:text-blue-300">contact@polybet.com</a>.
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



