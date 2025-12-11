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

function parseClientHints(headers: Headers) {
    const toFloat = (v: string | null) => (v ? parseFloat(v) : undefined);
    const toInt = (v: string | null) => (v ? parseInt(v, 10) : undefined);
    return {
        deviceMemory: toFloat(headers.get('device-memory')),
        dpr: toFloat(headers.get('dpr')),
        viewportWidth: toInt(headers.get('viewport-width')),
        downlink: toFloat(headers.get('downlink')),
        rtt: toInt(headers.get('rtt')),
        ect: headers.get('ect') || undefined,
    };
}

function parseAcceptLanguage(headers: Headers): string | undefined {
    const raw = headers.get('accept-language');
    if (!raw) return undefined;
    const [primary] = raw.split(',').map((part) => part.trim());
    return primary || undefined;
}

function parseUtm(url: URL | null) {
    if (!url) return {};
    const params = url.searchParams;
    const pick = (key: string) => params.get(key) || undefined;
    return {
        utmSource: pick('utm_source'),
        utmMedium: pick('utm_medium'),
        utmCampaign: pick('utm_campaign'),
        utmTerm: pick('utm_term'),
        utmContent: pick('utm_content'),
    };
}

function lookupGeoDetails(ip?: string | null) {
    if (!ip) return {};
    const mod = getGeoIpLite();
    if (!mod) return {};
    try {
        const record = mod.lookup(ip);
        return {
            country: record?.country || undefined,
            region: record?.region || undefined,
            city: record?.city || undefined,
            timezone: record?.timezone || undefined,
        };
    } catch {
        return {};
    }
}

function parseReferrer(headers: Headers) {
    return headers.get('referer') || headers.get('referrer') || undefined;
}

function parseNumberFromHeader(headers: Headers, key: string): number | undefined {
    const raw = headers.get(key);
    if (!raw) return undefined;
    const num = Number(raw);
    return Number.isFinite(num) ? num : undefined;
}

export async function updateUserTelemetry(userId: string, request: Request) {
    const headers = request.headers;
    const ip = getClientIp(headers);
    const uaString = headers.get('user-agent') || undefined;
    const { device, os } = parseUserAgent(uaString);
    const geo = lookupGeoDetails(ip);
    const country = geo.country || lookupCountry(ip);
    const locale = parseAcceptLanguage(headers);
    const referrer = parseReferrer(headers);
    const clientHints = parseClientHints(headers);
    const asn = parseNumberFromHeader(headers, 'cf-asn') ?? parseNumberFromHeader(headers, 'x-asn');
    const isp = headers.get('x-isp') || headers.get('cf-isp') || undefined;
    const now = new Date();

    let url: URL | null = null;
    try {
        url = new URL(request.url);
    } catch {
        url = null;
    }
    const utm = parseUtm(url);

    try {
        const aggregates = await fetchMonetaryAggregates(userId);

        await prisma.user.update({
            where: { id: userId },
            data: {
                lastIp: ip || undefined,
                lastCountry: country,
                lastRegion: geo.region,
                lastCity: geo.city,
                lastTimezone: geo.timezone,
                lastAsn: asn,
                lastIsp: isp,
                lastUserAgent: uaString,
                lastDevice: device,
                lastOs: os,
                lastLocale: locale,
                lastReferrer: referrer,
                lastUtmSource: utm.utmSource,
                lastUtmMedium: utm.utmMedium,
                lastUtmCampaign: utm.utmCampaign,
                lastUtmTerm: utm.utmTerm,
                lastUtmContent: utm.utmContent,
                lastDeviceMemory: clientHints.deviceMemory,
                lastDpr: clientHints.dpr,
                lastViewportWidth: clientHints.viewportWidth,
                lastDownlink: clientHints.downlink,
                lastRtt: clientHints.rtt,
                lastEct: clientHints.ect,
                lastVisitedAt: now,
                currentBalance: aggregates.currentBalance,
                totalDeposited: aggregates.totalDeposited,
                totalWithdrawn: aggregates.totalWithdrawn,
                telemetry: {
                    set: {
                        ip,
                        country,
                        region: geo.region,
                        city: geo.city,
                        timezone: geo.timezone,
                        asn,
                        isp,
                        ua: uaString,
                        device,
                        os,
                        locale,
                        referrer,
                        utm,
                        clientHints,
                        updatedAt: now.toISOString(),
                    },
                },
            },
        });
    } catch (error) {
        console.error('[telemetry] Failed to update user telemetry', error);
    }
}

export async function recordTelemetryEvent(params: {
    userId: string;
    request: Request;
    type: string;
    name: string;
    payload?: Record<string, unknown>;
}) {
    const { userId, request, type, name, payload } = params;
    const headers = request.headers;
    const ip = getClientIp(headers);
    const uaString = headers.get('user-agent') || undefined;
    const geo = lookupGeoDetails(ip);
    const country = geo.country || lookupCountry(ip);

    try {
        await prisma.telemetryEvent.create({
            data: {
                userId,
                type,
                name,
                payload,
                ip: ip || undefined,
                userAgent: uaString,
                country,
                city: geo.city,
                region: geo.region,
            },
        });
    } catch (error) {
        console.error('[telemetry] Failed to record telemetry event', error);
    }
}
