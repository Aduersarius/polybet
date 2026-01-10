'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';
import { motion, AnimatePresence } from 'framer-motion';
import { History, ArrowDownCircle, ArrowUpCircle, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { socket } from '@/lib/socket';
import { useToast } from '@/components/ui/use-toast';

interface Transaction {
  id: string;
  type: 'Deposit' | 'Withdrawal';
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = useSession();
  const { toast } = useToast();

  useEffect(() => {
    fetchTransactions();
    document.title = 'Transaction History | Pariflow';
  }, []);

  // WebSocket for real-time updates
  useEffect(() => {
    const user = (session as any)?.user;
    if (!user?.id) return;

    const userId = user.id;
    const channel = socket.subscribe(`user-${userId}`);

    const handleTransactionUpdate = (data: any) => {
      console.log('💸 Real-time transaction update:', data);

      // Update local state by prepending the new transaction
      setTransactions(prev => {
        // Avoid duplicates if same event arrives twice
        if (prev.some(t => t.id === data.id)) return prev;

        const newTransaction: Transaction = {
          id: data.id,
          type: data.type,
          amount: parseFloat(data.amount),
          currency: data.currency,
          status: data.status,
          createdAt: data.createdAt
        };

        return [newTransaction, ...prev];
      });

      // Show toast notification
      if (data.status === 'COMPLETED') {
        toast({
          title: `${data.type} Successful!`,
          description: `Your ${data.type.toLowerCase()} of ${data.amount} ${data.currency} was processed.`,
          variant: 'success'
        });
      }
    };

    channel.bind('transaction-update', handleTransactionUpdate);

    return () => {
      channel.unbind('transaction-update', handleTransactionUpdate);
      socket.unsubscribe(`user-${userId}`);
    };
  }, [session, toast]);

  const fetchTransactions = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [depositsRes, withdrawalsRes] = await Promise.all([
        fetch('/api/user/deposits'),
        fetch('/api/user/withdrawals')
      ]);

      if (!depositsRes.ok || !withdrawalsRes.ok) {
        throw new Error('Failed to fetch transactions');
      }

      const depositsData = await depositsRes.json();
      const withdrawalsData = await withdrawalsRes.json();

      const deposits: Transaction[] = depositsData.deposits.map((d: any) => ({
        id: d.id,
        type: 'Deposit' as const,
        amount: parseFloat(d.amount),
        currency: d.currency,
        status: d.status,
        createdAt: d.createdAt
      }));

      const withdrawals: Transaction[] = withdrawalsData.withdrawals.map((w: any) => ({
        id: w.id,
        type: 'Withdrawal' as const,
        amount: parseFloat(w.amount),
        currency: w.currency,
        status: w.status,
        createdAt: w.createdAt
      }));

      const combined = [...deposits, ...withdrawals].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setTransactions(combined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case 'COMPLETED':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'PENDING':
      case 'APPROVED':
        return <Clock className="w-4 h-4 text-amber-400" />;
      case 'FAILED':
      case 'REJECTED':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusUpper = status.toUpperCase();
    const baseClasses = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium";

    switch (statusUpper) {
      case 'COMPLETED':
        return `${baseClasses} bg-emerald-500/15 text-emerald-400 border border-emerald-500/20`;
      case 'PENDING':
      case 'APPROVED':
        return `${baseClasses} bg-amber-500/15 text-amber-400 border border-amber-500/20`;
      case 'FAILED':
      case 'REJECTED':
        return `${baseClasses} bg-red-500/15 text-red-400 border border-red-500/20`;
      default:
        return `${baseClasses} bg-gray-500/15 text-gray-400 border border-gray-500/20`;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-white font-sans flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 pt-24 pb-8 w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="material-card p-6 md:p-8"
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/20">
              <History className="w-6 h-6 text-[var(--primary)]" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">Transaction History</h1>
              <p className="text-sm text-gray-400">View your deposits and withdrawals</p>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </motion.div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-[var(--primary)]/30 border-t-[var(--primary)] rounded-full animate-spin" />
              <span className="ml-3 text-gray-400">Loading transactions...</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-800/50 flex items-center justify-center">
                <History className="w-8 h-8 text-gray-500" />
              </div>
              <p className="text-gray-400 text-lg">No transactions found</p>
              <p className="text-gray-500 text-sm mt-1">Your deposits and withdrawals will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left py-3 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider w-[140px]">Type</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider w-[120px]">Amount</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider w-[80px]">Token</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-gray-400 uppercase tracking-wider w-[130px]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <AnimatePresence initial={false}>
                    {transactions.map((transaction, idx) => (
                      <motion.tr
                        key={transaction.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="group hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${transaction.type === 'Deposit'
                              ? 'bg-emerald-500/10 border border-emerald-500/20'
                              : 'bg-orange-500/10 border border-orange-500/20'
                              }`}>
                              {transaction.type === 'Deposit' ? (
                                <ArrowDownCircle className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <ArrowUpCircle className="w-4 h-4 text-orange-400" />
                              )}
                            </div>
                            <span className="text-sm font-medium text-white">{transaction.type}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={`text-sm font-mono font-medium ${transaction.type === 'Deposit' ? 'text-emerald-400' : 'text-orange-400'
                            }`}>
                            {transaction.type === 'Deposit' ? '+' : '-'}{transaction.amount.toFixed(4)}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-sm font-medium text-gray-300 bg-white/5 px-2 py-0.5 rounded">
                            {transaction.currency}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-sm text-gray-400">
                            {formatDate(transaction.createdAt)}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={getStatusBadge(transaction.status)}>
                            {getStatusIcon(transaction.status)}
                            {transaction.status}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}