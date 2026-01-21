'use workflow';

import {
    validateWithdrawalStep,
    broadcastWithdrawalStep,
    finalizeWithdrawalStep
} from './withdrawal-steps';

interface WithdrawalEvent {
    withdrawalId: string;
    adminId: string;
}

export async function processWithdrawal(event: WithdrawalEvent) {
    const { withdrawalId, adminId } = event;

    // Step 1: Validate & Approve (DB updates)
    await validateWithdrawalStep(withdrawalId, adminId);

    // Step 2: Broadcast to Blockchain
    // If this fails, it retries. If logic errors (funds), it fails permanently.
    const txHash = await broadcastWithdrawalStep(withdrawalId);

    // Step 3: Wait for Confirmation & Finalize
    // This step contains tx.wait(). If it timeouts, the workflow retries this step.
    const result = await finalizeWithdrawalStep(withdrawalId, txHash, adminId);

    return {
        status: 'completed',
        withdrawalId,
        txHash: result.txHash
    };
}
