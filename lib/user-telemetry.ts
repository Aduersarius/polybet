import { Prisma } from '@prisma/client';
import UAParser from 'ua-parser-js';
import { prisma } from './prisma';

const toDecimal = (value: any) => new Prisma.Decimal(value ?? 0);

let geoipLite: any | null = null;
let geoipLoaded = false;

function getGeoIpLite() {
    if (geoipLoaded) return geoipLite;
    geoipLoaded = true;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        geoipLite = require('geoip-lite');
    } catch (err) {
        const msg = (err as Error)?.message ?? String(err);
        console.warn('[telemetry] geoip-lite not available; skipping country lookup', msg);
        geoipLite = null;
    }
    return geoipLite;
}

export function getClientIp(headers: Headers): string | null {
    const forwarded = headers.get('x-forwarded-for') || headers.get('x-forwarded-for'.toUpperCase());
    if (forwarded) {
        const candidate = forwarded.split(',').map((ip) => ip.trim()).find(Boolean);
        if (candidate) return candidate;
    }
    const realIp = headers.get('x-real-ip');
    if (realIp) return realIp;
    const cfIp = headers.get('cf-connecting-ip');
    if (cfIp) return cfIp;
    return null;
}

function lookupCountry(ip?: string | null): string | undefined {
    if (!ip) return undefined;
    const mod = getGeoIpLite();
    if (!mod) return undefined;
    try {
        return mod.lookup(ip)?.country || undefined;
    } catch {
        return undefined;
    }
}

function parseUserAgent(ua?: string | null) {
    if (!ua) return { device: undefined as string | undefined, os: undefined as string | undefined };
    const parser = new UAParser(ua);
    const result = parser.getResult();
    const device =
        result.device?.model ||
        (result.device?.type ? `${result.device.type}${result.device.vendor ? `-${result.device.vendor}` : ''}` : undefined);
    const os = result.os?.name ? `${result.os.name}${result.os.version ? ` ${result.os.version}` : ''}` : undefined;
    return { device, os };
}

async function fetchMonetaryAggregates(userId: string) {
    const [balanceRow] = await prisma.$queryRaw<Array<{ amount: Prisma.Decimal }>>`
        SELECT COALESCE(SUM("amount"), 0)::numeric AS amount
        FROM "Balance"
        WHERE "userId" = ${userId} AND "tokenSymbol" = 'TUSD' AND "eventId" IS NULL AND "outcomeId" IS NULL
    `;
    const [depositRow] = await prisma.$queryRaw<Array<{ amount: Prisma.Decimal }>>`
        SELECT COALESCE(SUM("amount"), 0)::numeric AS amount
        FROM "Deposit"
        WHERE "userId" = ${userId} AND "status" = 'COMPLETED'
    `;
    const [withdrawRow] = await prisma.$queryRaw<Array<{ amount: Prisma.Decimal }>>`
        SELECT COALESCE(SUM("amount"), 0)::numeric AS amount
        FROM "Withdrawal"
        WHERE "userId" = ${userId} AND "status" = 'COMPLETED'
    `;

    return {
        currentBalance: toDecimal(balanceRow?.amount),
        totalDeposited: toDecimal(depositRow?.amount),
        totalWithdrawn: toDecimal(withdrawRow?.amount),
    };
}

export async function updateUserTelemetry(userId: string, headers: Headers) {
    const ip = getClientIp(headers);
    const uaString = headers.get('user-agent') || undefined;
    const { device, os } = parseUserAgent(uaString);
    const country = lookupCountry(ip);
    const now = new Date();

    try {
        const aggregates = await fetchMonetaryAggregates(userId);

        await prisma.user.update({
            where: { id: userId },
            data: {
                lastIp: ip || undefined,
                lastCountry: country,
                lastUserAgent: uaString,
                lastDevice: device,
                lastOs: os,
                lastVisitedAt: now,
                currentBalance: aggregates.currentBalance,
                totalDeposited: aggregates.totalDeposited,
                totalWithdrawn: aggregates.totalWithdrawn,
                telemetry: {
                    set: {
                        ip,
                        country,
                        ua: uaString,
                        device,
                        os,
                        updatedAt: now.toISOString(),
                    },
                },
            },
        });
    } catch (error) {
        console.error('[telemetry] Failed to update user telemetry', error);
    }
}
