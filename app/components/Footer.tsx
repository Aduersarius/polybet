'use client';
import Link from 'next/link';
import { Mail, Twitter, Github, MessageCircle } from 'lucide-react';

export function Footer() {
    return (
        <footer className="border-t border-white/10 bg-black/50 backdrop-blur-md mt-auto relative z-50 pointer-events-auto">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                        {/* Left: Contact Button */}
                        <a
                            href="mailto:contact@polybet.com"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/40 text-gray-400 hover:text-blue-300 text-xs font-medium transition-all"
                        >
                            <Mail className="w-3 h-3" />
                            Contact Us
                        </a>
                        {/* Legal Links */}
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                            <Link prefetch href="/legal/cookie-policy" className="hover:text-white transition-colors">Cookie Policy</Link>
                            <span className="text-gray-600">•</span>
                            <Link prefetch href="/legal/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
                            <span className="text-gray-600">•</span>
                            <Link prefetch href="/legal/terms" className="hover:text-white transition-colors">Terms & Conditions</Link>
                            <span className="text-gray-600">•</span>
                            <Link prefetch href="/legal/risk-warning" className="hover:text-white transition-colors">Risk Warning</Link>
                        </div>
                    </div>

                    {/* Center: Copyright */}
                    <div className="text-[10px] text-gray-500 text-center sm:text-right">
                        © 2025 PolyBet. All rights reserved.
                    </div>

                    {/* Right: Social Media Links */}
                    <div className="flex items-center gap-2">
                        <a
                            href="https://twitter.com/polybet_en"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/50 flex items-center justify-center text-gray-400 hover:text-blue-400 transition-all"
                            aria-label="Twitter"
                        >
                            <Twitter className="w-3 h-3" />
                        </a>
                        <a
                            href="https://github.com/polybet"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-400/50 flex items-center justify-center text-gray-400 hover:text-purple-400 transition-all"
                            aria-label="GitHub"
                        >
                            <Github className="w-3 h-3" />
                        </a>
                        <a
                            href="https://discord.gg/polybet"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-7 h-7 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-400/50 flex items-center justify-center text-gray-400 hover:text-indigo-400 transition-all"
                            aria-label="Discord"
                        >
                            <MessageCircle className="w-3 h-3" />
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
