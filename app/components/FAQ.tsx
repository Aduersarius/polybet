'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FAQItem {
  question: string;
  answer: string | React.ReactNode;
  category: string;
}

const faqData: FAQItem[] = [
  // Getting Started
  {
    category: 'Getting Started',
    question: 'What is Pariflow?',
    answer: 'Pariflow is a prediction market platform where you can trade on the outcomes of real-world events. Buy shares in YES or NO outcomes, and if you\'re right, each share pays $1 when the event resolves.',
  },
  {
    category: 'Getting Started',
    question: 'How do I start trading?',
    answer: 'Sign up for an account, deposit funds via crypto (USDC on Polygon), browse markets, and place your first trade. It\'s that simple! Click "Show Tour" in your profile menu for a guided walkthrough.',
  },
  {
    category: 'Getting Started',
    question: 'Is there a minimum deposit or bet amount?',
    answer: 'The minimum bet amount is $0.10. There\'s no minimum deposit - you can deposit any amount you want.',
  },

  // How It Works
  {
    category: 'How It Works',
    question: 'What are YES/NO markets?',
    answer: 'YES/NO markets are binary prediction markets. Buy YES if you think an event will happen, or NO if you don\'t. When the market resolves, winning shares pay exactly $1.00, while losing shares become worthless.',
  },
  {
    category: 'How It Works',
    question: 'How are odds calculated?',
    answer: 'Odds represent the market\'s collective prediction of an outcome\'s probability. They\'re determined by supply and demand - when more people buy YES, the YES price (and probability) increases. The prices of YES and NO always add up to $1.00.',
  },
  {
    category: 'How It Works',
    question: 'What does the percentage mean?',
    answer: 'The percentage shows the implied probability of that outcome. For example, 70% YES means the market thinks there\'s a 70% chance the event will happen. The current price is always close to this percentage divided by 100.',
  },
  {
    category: 'How It Works',
    question: 'Can I sell my shares before the event ends?',
    answer: 'Yes! You can sell your shares at any time before the market closes to lock in profits or minimize losses. The sell price will be the current market price at that moment.',
  },
  {
    category: 'How It Works',
    question: 'What is the order book?',
    answer: 'The order book shows all pending limit orders. BUY orders (green) are from people wanting to buy at specific prices. SELL orders (red) are from people wanting to sell. You can click on any order to fill it directly.',
  },
  {
    category: 'How It Works',
    question: 'What\'s the difference between market and limit orders?',
    answer: 'Market orders execute immediately at the best available price. Limit orders let you set your desired price - they only execute if the market reaches that price. Limit orders appear in the order book until filled or cancelled.',
  },

  // Trading & Strategy
  {
    category: 'Trading & Strategy',
    question: 'How do I make money?',
    answer: 'Buy low, sell high! If you buy YES shares at 60¢ and the event happens, you earn 40¢ per share ($1.00 payout - 60¢ cost). You can also sell before resolution if the price moves in your favor.',
  },
  {
    category: 'Trading & Strategy',
    question: 'What are the trading limits?',
    answer: 'Minimum bet: $0.10. Maximum single bet: $10,000. There are also daily trading limits per market and risk management controls to ensure fair and stable markets.',
  },
  {
    category: 'Trading & Strategy',
    question: 'Can I trade multiple outcomes in one event?',
    answer: 'Yes! For multiple-choice markets, you can buy shares in any or all outcomes. Only one outcome will win, so winning shares pay $1.00 each while all others become worthless.',
  },
  {
    category: 'Trading & Strategy',
    question: 'What happens if I lose?',
    answer: 'If your prediction is wrong, your shares become worthless and you lose the amount you paid for them. Never trade more than you can afford to lose.',
  },

  // Deposits & Withdrawals
  {
    category: 'Deposits & Withdrawals',
    question: 'How do I deposit funds?',
    answer: 'Click the "Deposit" button, choose your payment method, and follow the instructions. We accept USDC on Polygon network. Your balance updates instantly after the transaction confirms.',
  },
  {
    category: 'Deposits & Withdrawals',
    question: 'How do I withdraw my winnings?',
    answer: 'Click your profile icon, select "Withdraw", enter the amount and your Polygon wallet address. Withdrawals require 2FA to be enabled and you must have placed at least one bet. Admin approval is required for security.',
  },
  {
    category: 'Deposits & Withdrawals',
    question: 'Are there withdrawal limits?',
    answer: 'Yes. There are both single withdrawal limits and daily withdrawal limits. These are displayed in the withdrawal modal. Limits reset at midnight UTC.',
  },
  {
    category: 'Deposits & Withdrawals',
    question: 'How long do withdrawals take?',
    answer: 'Withdrawals require admin approval for security. Once approved, funds are sent to your Polygon wallet as USDC, typically within 24-48 hours.',
  },
  {
    category: 'Deposits & Withdrawals',
    question: 'What blockchain does Pariflow use?',
    answer: 'We use Polygon (MATIC) network for all deposits and withdrawals. Transactions are fast and have very low fees compared to Ethereum mainnet.',
  },

  // Account & Security
  {
    category: 'Account & Security',
    question: 'Do I need 2FA?',
    answer: 'Two-factor authentication (2FA) is required to withdraw funds. We highly recommend enabling it in your settings to secure your account.',
  },
  {
    category: 'Account & Security',
    question: 'Is my money safe?',
    answer: 'We take security seriously. All funds are held securely, withdrawals require 2FA and admin approval, and we use industry-standard encryption. However, only deposit what you can afford to lose.',
  },
  {
    category: 'Account & Security',
    question: 'Can I have multiple accounts?',
    answer: 'No. Each user is allowed only one account. Multiple accounts may result in suspension.',
  },

  // Markets & Events
  {
    category: 'Markets & Events',
    question: 'What types of events can I bet on?',
    answer: 'You can trade on sports, politics, crypto prices, entertainment, and more. Browse categories or search for specific topics to find markets that interest you.',
  },
  {
    category: 'Markets & Events',
    question: 'Who decides when markets close?',
    answer: 'Each market has a specified end date/time. Markets close when the event starts or when the outcome becomes known, whichever comes first.',
  },
  {
    category: 'Markets & Events',
    question: 'How are markets resolved?',
    answer: 'Markets are resolved by our admin team based on official sources and public information. Winning shares pay $1.00, losing shares become worthless.',
  },
  {
    category: 'Markets & Events',
    question: 'What happens if an event is cancelled?',
    answer: 'If an event is cancelled or doesn\'t happen as specified, the market is typically resolved as invalid and all shares are refunded at their purchase price.',
  },
  {
    category: 'Markets & Events',
    question: 'Can I suggest new markets?',
    answer: 'Yes! Click "Suggest event" in your profile menu to submit ideas for new markets. Our team reviews all suggestions.',
  },

  // Fees & Costs
  {
    category: 'Fees & Costs',
    question: 'Are there any fees?',
    answer: 'We charge a small fee on winning trades to maintain the platform. This fee is built into the market prices. There are no deposit fees, but standard blockchain gas fees apply for crypto transactions.',
  },
  {
    category: 'Fees & Costs',
    question: 'What are blockchain gas fees?',
    answer: 'Gas fees are small transaction fees paid to the Polygon network for processing your deposits/withdrawals. Polygon fees are typically just a few cents.',
  },

  // Support
  {
    category: 'Support',
    question: 'I found a bug or issue. How do I report it?',
    answer: 'Please contact our support team through the contact information in your profile settings or email us directly. We appreciate bug reports and will investigate promptly.',
  },
  {
    category: 'Support',
    question: 'Can I contact support?',
    answer: 'Yes! Reach out through your account settings or email us. We\'re here to help with any questions or issues.',
  },
];

const categories = Array.from(new Set(faqData.map(item => item.category)));

interface FAQProps {
  initialCategory?: string;
}

export function FAQ({ initialCategory }: FAQProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'All');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const filteredFAQs = selectedCategory === 'All'
    ? faqData
    : faqData.filter(item => item.category === selectedCategory);

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="space-y-6">
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory('All')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedCategory === 'All'
              ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
              : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
            }`}
        >
          All
        </button>
        {categories.map(category => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${selectedCategory === category
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10'
              }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* FAQ Items */}
      <div className="space-y-3">
        {filteredFAQs.map((item, index) => (
          <div
            key={`${item.category}-${index}`}
            className="bg-[#1a1f2e]/50 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden hover:border-blue-500/30 transition-all"
          >
            <button
              onClick={() => toggleItem(index)}
              className="w-full px-5 py-4 flex items-center justify-between text-left group"
            >
              <div className="flex-1 pr-4">
                <span className="text-xs text-blue-400 font-medium mb-1 block">
                  {item.category}
                </span>
                <span className="text-white font-medium group-hover:text-blue-400 transition-colors">
                  {item.question}
                </span>
              </div>
              <div className="flex-shrink-0">
                {openIndex === index ? (
                  <ChevronUp className="w-5 h-5 text-blue-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-white/50 group-hover:text-blue-400 transition-colors" />
                )}
              </div>
            </button>

            <AnimatePresence>
              {openIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-4 text-sm text-white/70 leading-relaxed border-t border-white/5 pt-4">
                    {item.answer}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {filteredFAQs.length === 0 && (
        <div className="text-center py-12 text-white/50">
          No FAQs found in this category.
        </div>
      )}
    </div>
  );
}

