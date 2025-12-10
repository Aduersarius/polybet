'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';
import { motion } from 'framer-motion';
import { History, ArrowDownCircle, ArrowUpCircle, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react';

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

  useEffect(() => {
    fetchTransactions();
  }, []);

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
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'PENDING':
      case 'APPROVED':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'FAILED':
      case 'REJECTED':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'COMPLETED':
        return 'text-green-400';
      case 'PENDING':
      case 'APPROVED':
        return 'text-yellow-400';
      case 'FAILED':
      case 'REJECTED':
        return 'text-red-400';
      default:
        return 'text-gray-400';
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
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#1e1e1e] rounded-2xl border border-transparent p-8 hover:border-blue-500/50 transition-all duration-300"
        >
          <div className="flex items-center gap-3 mb-6">
            <History className="w-8 h-8 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">Transaction History</h1>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </motion.div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <span className="ml-3 text-gray-400">Loading transactions...</span>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No transactions found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Type</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Amount</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Token</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <motion.tr
                      key={transaction.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="border-b border-gray-800/50 hover:bg-[#2a2a2a]/50 transition-colors"
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          {transaction.type === 'Deposit' ? (
                            <ArrowDownCircle className="w-4 h-4 text-green-400" />
                          ) : (
                            <ArrowUpCircle className="w-4 h-4 text-red-400" />
                          )}
                          <span className="text-sm font-medium">{transaction.type}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-sm font-mono">
                          {transaction.amount.toFixed(4)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-sm font-medium text-gray-300">
                          {transaction.currency}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-sm text-gray-400">
                          {formatDate(transaction.createdAt)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(transaction.status)}
                          <span className={`text-sm font-medium ${getStatusColor(transaction.status)}`}>
                            {transaction.status}
                          </span>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
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