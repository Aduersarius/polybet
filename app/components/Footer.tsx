'use client';
import Link from 'next/link';
import { Mail, Twitter, Github, MessageCircle } from 'lucide-react';

export function Footer() {
    return (
        <footer className="border-t border-white/10 bg-black/50 backdrop-blur-md mt-auto sticky top-[100vh]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
                <div className="flex items-center justify-between gap-4">
                    {/* Left: Contact Button */}
                    <a
                        href="mailto:contact@polybet.com"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/40 text-gray-400 hover:text-blue-300 text-xs font-medium transition-all"
                    >
                        <Mail className="w-3 h-3" />
                        Contact Us
                    </a>

                    {/* Center: Copyright */}
                    <div className="text-[10px] text-gray-500 text-center hidden sm:block">
                        © 2025 PolyBet. All rights reserved.
                    </div>

                    {/* Right: Social Media Links */}
                    <div className="flex items-center gap-2">
                        <a
                            href="https://twitter.com/polybet"
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
