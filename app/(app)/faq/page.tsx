import { FAQ } from '@/app/components/FAQ';
import { HelpCircle } from 'lucide-react';

export const metadata = {
  title: 'FAQ - Frequently Asked Questions | Polybet',
  description: 'Find answers to common questions about trading on Polybet prediction markets.',
};

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f1419] to-[#1a1f2e] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 mb-6">
            <HelpCircle className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-white via-blue-200 to-white bg-clip-text text-transparent mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-white/60 max-w-2xl mx-auto">
            Find answers to common questions about how Polybet works, trading strategies, deposits, withdrawals, and more.
          </p>
        </div>

        {/* Quick Start Guide */}
        <div className="bg-gradient-to-br from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-2xl p-6 mb-8">
          <h3 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
            <span>🚀</span> Quick Start
          </h3>
          <div className="grid sm:grid-cols-3 gap-4 text-sm text-white/80">
            <div>
              <div className="font-semibold text-emerald-400 mb-1">1. Sign Up & Deposit</div>
              <p className="text-xs text-white/60">Create account and add USDC on Polygon</p>
            </div>
            <div>
              <div className="font-semibold text-blue-400 mb-1">2. Browse Markets</div>
              <p className="text-xs text-white/60">Find events you want to trade on</p>
            </div>
            <div>
              <div className="font-semibold text-purple-400 mb-1">3. Place Trades</div>
              <p className="text-xs text-white/60">Buy YES or NO and win if you\'re right</p>
            </div>
          </div>
        </div>

        {/* FAQ Component */}
        <FAQ />

        {/* Still Have Questions? */}
        <div className="mt-12 bg-[#1a1f2e]/50 backdrop-blur-md border border-white/10 rounded-2xl p-8 text-center">
          <h3 className="text-2xl font-bold text-white mb-3">
            Still have questions?
          </h3>
          <p className="text-white/60 mb-6">
            Can\'t find what you\'re looking for? Try our guided tour or reach out to support.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/#tour';
                }
              }}
              className="px-6 py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
            >
              Take the Tour
            </button>
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/settings#contact';
                }
              }}
              className="px-6 py-3 rounded-lg bg-white/5 hover:bg-white/10 text-white font-medium border border-white/10 transition-colors"
            >
              Contact Support
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

