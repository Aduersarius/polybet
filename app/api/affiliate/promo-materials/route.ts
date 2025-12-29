import { NextRequest, NextResponse } from 'next/server';
import { requireAffiliateAuth } from '@/lib/affiliate-auth';

interface PromoMaterial {
  id: string;
  name: string;
  category: 'banner' | 'badge' | 'logo';
  format: 'square' | 'vertical' | 'horizontal';
  dimensions: string;
  url: string;
  embedCode: string;
}

export async function GET(req: NextRequest) {
  try {
    const affiliate = await requireAffiliateAuth(req);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    // Generate materials with affiliate code embedded
    const materials: PromoMaterial[] = [
      // Square badges (for reels/TikTok)
      {
        id: 'badge-square-1',
        name: 'Square Badge 1',
        category: 'badge',
        format: 'square',
        dimensions: '1080x1080',
        url: `${baseUrl}/api/affiliate/promo-materials/badge-square-1?ref=${affiliate.referralCode}`,
        embedCode: `<img src="${baseUrl}/api/affiliate/promo-materials/badge-square-1?ref=${affiliate.referralCode}" alt="PolyBet" />`,
      },
      {
        id: 'badge-square-2',
        name: 'Square Badge 2',
        category: 'badge',
        format: 'square',
        dimensions: '1080x1080',
        url: `${baseUrl}/api/affiliate/promo-materials/badge-square-2?ref=${affiliate.referralCode}`,
        embedCode: `<img src="${baseUrl}/api/affiliate/promo-materials/badge-square-2?ref=${affiliate.referralCode}" alt="PolyBet" />`,
      },
      // Vertical banners (for stories)
      {
        id: 'banner-vertical-1',
        name: 'Vertical Banner 1',
        category: 'banner',
        format: 'vertical',
        dimensions: '1080x1920',
        url: `${baseUrl}/api/affiliate/promo-materials/banner-vertical-1?ref=${affiliate.referralCode}`,
        embedCode: `<img src="${baseUrl}/api/affiliate/promo-materials/banner-vertical-1?ref=${affiliate.referralCode}" alt="PolyBet" />`,
      },
      {
        id: 'banner-vertical-2',
        name: 'Vertical Banner 2',
        category: 'banner',
        format: 'vertical',
        dimensions: '1080x1920',
        url: `${baseUrl}/api/affiliate/promo-materials/banner-vertical-2?ref=${affiliate.referralCode}`,
        embedCode: `<img src="${baseUrl}/api/affiliate/promo-materials/banner-vertical-2?ref=${affiliate.referralCode}" alt="PolyBet" />`,
      },
      // Horizontal banners
      {
        id: 'banner-horizontal-1',
        name: 'Horizontal Banner 1',
        category: 'banner',
        format: 'horizontal',
        dimensions: '1920x1080',
        url: `${baseUrl}/api/affiliate/promo-materials/banner-horizontal-1?ref=${affiliate.referralCode}`,
        embedCode: `<img src="${baseUrl}/api/affiliate/promo-materials/banner-horizontal-1?ref=${affiliate.referralCode}" alt="PolyBet" />`,
      },
      // Logos
      {
        id: 'logo-square',
        name: 'Square Logo',
        category: 'logo',
        format: 'square',
        dimensions: '512x512',
        url: `${baseUrl}/api/affiliate/promo-materials/logo-square?ref=${affiliate.referralCode}`,
        embedCode: `<img src="${baseUrl}/api/affiliate/promo-materials/logo-square?ref=${affiliate.referralCode}" alt="PolyBet" />`,
      },
    ];

    return NextResponse.json({ materials });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('[Promo Materials] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch promo materials' },
      { status: 500 }
    );
  }
}

