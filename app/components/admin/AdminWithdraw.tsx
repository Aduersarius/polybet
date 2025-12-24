'use client';

import { motion } from 'framer-motion';
import { AdminWithdrawalRequests } from './AdminWithdrawalRequests';

export function AdminWithdraw() {
    return (
        <div className="space-y-10">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-zinc-200">Withdrawal Requests</h2>
                    <p className="text-sm text-muted-foreground mt-1">Review and action pending withdrawals.</p>
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface rounded-2xl border border-white/5 p-8"
            >
                <AdminWithdrawalRequests />
            </motion.div>
        </div>
    );
}
