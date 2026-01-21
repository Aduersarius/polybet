'use step';

import { getCryptoService } from '@/lib/crypto-service';

export async function validateWithdrawalStep(withdrawalId: string, adminId: string) {
    console.log('[Workflow] Validating withdrawal:', withdrawalId);
    return await getCryptoService().validateAndApproveWithdrawal(withdrawalId, adminId);
}

export async function broadcastWithdrawalStep(withdrawalId: string) {
    console.log('[Workflow] Broadcasting withdrawal:', withdrawalId);
    return await getCryptoService().broadcastWithdrawal(withdrawalId);
}



export async function finalizeWithdrawalStep(withdrawalId: string, txHash: string, adminId: string) {
    console.log('[Workflow] Finalizing withdrawal:', withdrawalId, txHash);
    return await getCryptoService().finalizeWithdrawal(withdrawalId, txHash, adminId);
}
