/**
 * Volume Scaling Utility
 * 
 * Scales external (Polymarket) volume to proportional values for our platform.
 * Also applies time-based growth to simulate organic activity.
 */

/**
 * Scale down volume on intake.
 * Divides by a random factor between 80-120 to make volume proportional to platform scale.
 * 
 * @param externalVolume - The original volume from Polymarket
 * @returns Scaled down volume for storage
 */
export function scaleVolumeForStorage(externalVolume: number): number {
    if (!externalVolume || externalVolume <= 0) return 0;

    // Random divisor between 80 and 120
    const divisor = 80 + Math.random() * 40; // 80 to 120
    return Math.round(externalVolume / divisor);
}

/**
 * Calculate display volume with time-based growth.
 * Applies a small hourly growth rate to simulate organic activity.
 * 
 * @param baseVolume - The stored (already scaled) volume
 * @param eventCreatedAt - When the event was created
 * @param growthRatePerHour - Growth rate per hour (default 0.15% = 0.0015)
 * @returns Display volume with growth applied
 */
export function calculateDisplayVolume(
    baseVolume: number,
    eventCreatedAt: Date | string,
    growthRatePerHour: number = 0.0015 // 0.15% per hour ≈ 3.6% per day
): number {
    if (!baseVolume || baseVolume <= 0) return 0;

    const createdAt = typeof eventCreatedAt === 'string' ? new Date(eventCreatedAt) : eventCreatedAt;
    const now = new Date();

    // Calculate hours elapsed
    const msElapsed = now.getTime() - createdAt.getTime();
    const hoursElapsed = Math.max(0, msElapsed / (1000 * 60 * 60));

    // Apply growth: baseVolume * (1 + hours * rate)
    // Cap at 2x growth to prevent runaway numbers on old events
    const growthMultiplier = Math.min(2, 1 + hoursElapsed * growthRatePerHour);

    return Math.round(baseVolume * growthMultiplier);
}

/**
 * Combined function: scale external volume and get display-ready value.
 * Use this when you have external volume but no stored base yet.
 * 
 * @param externalVolume - Original Polymarket volume
 * @param eventCreatedAt - When event was created (for growth calculation)
 * @returns Display-ready volume
 */
export function scaleAndGrowVolume(
    externalVolume: number,
    eventCreatedAt: Date | string
): number {
    const baseVolume = scaleVolumeForStorage(externalVolume);
    return calculateDisplayVolume(baseVolume, eventCreatedAt);
}
