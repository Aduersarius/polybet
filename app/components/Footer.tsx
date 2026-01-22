'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { LoginModal } from './auth/LoginModal';
import { SignupModal } from './auth/SignupModal';

export function Footer() {
    const { data: rawSession } = useSession();
    const session = (rawSession as any)?.session?.isTwoFactorRequired ? null : rawSession;
    const isAuthenticated = !!(session as any)?.user;
    
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showSignupModal, setShowSignupModal] = useState(false);

    return (
        <>
            <footer className="border-t border-white/10 bg-gray-800 mt-auto relative z-50 pointer-events-auto">
                <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[11px] text-gray-400">
                        <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                            {/* Auth buttons for non-authenticated users on mobile only */}
                            {!isAuthenticated && (
                                <>
                                    <button 
                                        onClick={() => setShowLoginModal(true)}
                                        className="md:hidden hover:text-white transition-colors font-medium"
                                    >
                                        Login
                                    </button>
                                    <span className="md:hidden text-gray-600">•</span>
                                    <button 
                                        onClick={() => setShowSignupModal(true)}
                                        className="md:hidden hover:text-white transition-colors font-medium text-blue-400 hover:text-blue-300"
                                    >
                                        Sign Up
                                    </button>
                                    <span className="md:hidden text-gray-600">•</span>
                                </>
                            )}
                            <Link prefetch href="/faq" className="hover:text-white transition-colors">FAQ</Link>
                            <span className="text-gray-600">•</span>
                            <Link prefetch href="/legal/cookie-policy" className="hover:text-white transition-colors">Cookie Policy</Link>
                            <span className="text-gray-600">•</span>
                            <Link prefetch href="/legal/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
                            <span className="text-gray-600">•</span>
                            <Link prefetch href="/legal/terms" className="hover:text-white transition-colors">Terms & Conditions</Link>
                            <span className="text-gray-600">•</span>
                            <Link prefetch href="/legal/risk-warning" className="hover:text-white transition-colors">Risk Warning</Link>
                            <span className="text-gray-600">•</span>
                            <Link prefetch href="/affiliate/signup" className="hover:text-white transition-colors">Become a Partner</Link>
                            <span className="text-gray-600">•</span>
                            <a href="https://docs.pariflow.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Documentation</a>
                            <span className="text-gray-600">•</span>
                            <a href="https://www.instagram.com/pariflow_official/" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Instagram</a>
                            <span className="text-gray-600">•</span>
                            <a href="https://discord.gg/zdm8sVgg" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Discord</a>
                        </div>
                        <div className="text-[10px] text-gray-500 text-center">
                            © 2026 Pariflow. All rights reserved.
                        </div>
                    </div>
                </div>
            </footer>

            {/* Auth Modals */}
            <LoginModal
                isOpen={showLoginModal}
                onClose={() => setShowLoginModal(false)}
                onSwitchToSignup={() => {
                    setShowLoginModal(false);
                    setShowSignupModal(true);
                }}
            />
            <SignupModal
                isOpen={showSignupModal}
                onClose={() => setShowSignupModal(false)}
                onSwitchToLogin={() => {
                    setShowSignupModal(false);
                    setShowLoginModal(true);
                }}
            />
        </>
    );
}
