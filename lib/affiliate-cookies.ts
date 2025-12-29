/**
 * Affiliate Cookie Utilities (Edge Runtime Compatible)
 * 
 * These functions can be used in middleware/proxy (Edge runtime)
 * They don't require Prisma or database access
 */

const AFFILIATE_COOKIE_NAME = 'affiliate_ref';
const AFFILIATE_COOKIE_DAYS = 30;

/**
 * Set affiliate tracking cookie
 */
export function setAffiliateCookie(affiliateId: string, days: number = AFFILIATE_COOKIE_DAYS): string {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  return `${AFFILIATE_COOKIE_NAME}=${affiliateId}; expires=${expires.toUTCString()}; path=/; SameSite=Lax; Secure`;
}

/**
 * Get affiliate ID from cookie
 */
export function getAffiliateCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const affiliateCookie = cookies.find(c => c.startsWith(`${AFFILIATE_COOKIE_NAME}=`));
  
  if (!affiliateCookie) return null;
  
  return affiliateCookie.split('=')[1] || null;
}

/**
 * Clear affiliate cookie
 */
export function clearAffiliateCookie(): string {
  return `${AFFILIATE_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax; Secure`;
}

