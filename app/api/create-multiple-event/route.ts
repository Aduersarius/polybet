import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminAuth } from '@/lib/auth';
import { assertSameOrigin } from '@/lib/csrf';

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    assertSameOrigin(request);
    await requireAdminAuth(request);

    const body = await request.json();
    const { eventType = 'tech-trillion-race' } = body;

    console.log('Creating multiple outcome event via API...');

    let eventData;
    let outcomes;

    // Define different event types
    switch (eventType) {
      case 'tech-trillion-race':
        eventData = {
          id: 'tech-trillion-race',
          title: 'Which company will hit $1T market cap first?',
          description: 'Predict which tech giant will reach the $1 trillion valuation milestone first. This event will resolve when any of the companies reaches this milestone.',
          categories: ['TECH', 'BUSINESS'],
          resolutionDate: new Date('2026-12-31'),
          status: 'ACTIVE',
          type: 'MULTIPLE',
          initialLiquidity: 500.0,
          liquidityParameter: 15000.0,
          creatorId: 'dev-user',
        };
        outcomes = [
          { name: 'Apple', probability: 0.25, liquidity: 100.0, color: '#000000' },
          { name: 'Nvidia', probability: 0.30, liquidity: 120.0, color: '#76B900' },
          { name: 'Google', probability: 0.20, liquidity: 80.0, color: '#4285F4' },
          { name: 'Amazon', probability: 0.15, liquidity: 60.0, color: '#FF9900' },
          { name: 'Tesla', probability: 0.10, liquidity: 40.0, color: '#CC0000' }
        ];
        break;

      case 'largest-company-june':
        eventData = {
          id: 'largest-company-june-2025',
          title: 'Largest company by market cap end of June 2025?',
          description: 'Which company will have the highest market capitalization at the end of June 2025?',
          categories: ['BUSINESS', 'FINANCE'],
          resolutionDate: new Date('2025-06-30'),
          status: 'ACTIVE',
          type: 'MULTIPLE',
          initialLiquidity: 300.0,
          liquidityParameter: 12000.0,
          creatorId: 'dev-user',
        };
        outcomes = [
          { name: 'Microsoft', probability: 0.22, liquidity: 80.0, color: '#00BCF2' },
          { name: 'Apple', probability: 0.20, liquidity: 75.0, color: '#000000' },
          { name: 'Nvidia', probability: 0.18, liquidity: 70.0, color: '#76B900' },
          { name: 'Google', probability: 0.15, liquidity: 60.0, color: '#4285F4' },
          { name: 'Amazon', probability: 0.12, liquidity: 50.0, color: '#FF9900' },
          { name: 'Meta', probability: 0.08, liquidity: 35.0, color: '#1877F2' },
          { name: 'Tesla', probability: 0.05, liquidity: 20.0, color: '#CC0000' }
        ];
        break;

      case 'crypto-dominance':
        eventData = {
          id: 'crypto-dominance-2025',
          title: 'Which cryptocurrency will have highest market share end of 2025?',
          description: 'Predict which cryptocurrency will have the largest market share percentage at the end of 2025.',
          categories: ['CRYPTO', 'FINANCE'],
          resolutionDate: new Date('2025-12-31'),
          status: 'ACTIVE',
          type: 'MULTIPLE',
          initialLiquidity: 400.0,
          liquidityParameter: 14000.0,
          creatorId: 'dev-user',
        };
        outcomes = [
          { name: 'Bitcoin', probability: 0.45, liquidity: 150.0, color: '#F7931A' },
          { name: 'Ethereum', probability: 0.30, liquidity: 100.0, color: '#627EEA' },
          { name: 'Solana', probability: 0.10, liquidity: 40.0, color: '#9945FF' },
          { name: 'Cardano', probability: 0.08, liquidity: 35.0, color: '#0033AD' },
          { name: 'Avalanche', probability: 0.04, liquidity: 20.0, color: '#E84142' },
          { name: 'Other', probability: 0.03, liquidity: 15.0, color: '#666666' }
        ];
        break;

      case 'election-winner':
        eventData = {
          id: 'us-presidential-2024',
          title: 'Who will win the 2024 US Presidential Election?',
          description: 'Predict the winner of the 2024 United States Presidential Election.',
          categories: ['POLITICS', 'ELECTIONS'],
          resolutionDate: new Date('2024-11-05'),
          status: 'ACTIVE',
          type: 'MULTIPLE',
          initialLiquidity: 600.0,
          liquidityParameter: 18000.0,
          creatorId: 'dev-user',
        };
        outcomes = [
          { name: 'Donald Trump', probability: 0.48, liquidity: 180.0, color: '#C8102E' },
          { name: 'Kamala Harris', probability: 0.45, liquidity: 170.0, color: '#0033A0' },
          { name: 'Other', probability: 0.07, liquidity: 30.0, color: '#666666' }
        ];
        break;

      case 'tech-companies-future':
        eventData = {
          id: 'tech-companies-2026',
          title: 'Which tech company will reach $2T market cap first?',
          description: 'Predict which major tech company will be the first to reach a $2 trillion market capitalization.',
          categories: ['TECH', 'BUSINESS'],
          resolutionDate: new Date('2026-12-31'),
          status: 'ACTIVE',
          type: 'MULTIPLE',
          initialLiquidity: 500.0,
          liquidityParameter: 15000.0,
          creatorId: 'dev-user',
        };
        outcomes = [
          { name: 'Nvidia', probability: 0.25, liquidity: 100.0, color: '#76B900' },
          { name: 'Microsoft', probability: 0.25, liquidity: 100.0, color: '#00BCF2' },
          { name: 'Apple', probability: 0.20, liquidity: 80.0, color: '#000000' },
          { name: 'Google', probability: 0.15, liquidity: 60.0, color: '#4285F4' },
          { name: 'Amazon', probability: 0.10, liquidity: 40.0, color: '#FF9900' },
          { name: 'Tesla', probability: 0.05, liquidity: 20.0, color: '#CC0000' }
        ];
        break;

      default:
        return NextResponse.json({
          error: 'Unknown event type'
        }, { status: 400 });
    }

    // Check if event already exists
    let event = await prisma.event.findUnique({
      where: { id: eventData.id }
    });

    if (!event) {
      // Create the event
      event = await prisma.event.create({
        data: eventData
      });
    }

    console.log('Event:', event.id);

    // Check if outcomes already exist
    const existingOutcomes = await prisma.outcome.findMany({
      where: { eventId: event.id }
    });

    if (existingOutcomes.length === 0) {
      // Create outcomes
      for (const outcome of outcomes) {
        await prisma.outcome.create({
          data: {
            eventId: event.id,
            name: outcome.name,
            probability: outcome.probability,
            liquidity: outcome.liquidity,
            color: outcome.color,
          }
        });
      }
      console.log('Created outcomes for the event');
    } else {
      console.log('Outcomes already exist for the event');
    }

    return NextResponse.json({
      success: true,
      message: 'Multiple outcome event created successfully',
      eventId: event.id,
      eventType
    });

  } catch (error) {
    console.error('Error creating multiple outcome event:', error);
    return NextResponse.json({
      error: 'Failed to create multiple outcome event',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}