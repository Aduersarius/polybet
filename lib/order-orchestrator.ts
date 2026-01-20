import { prisma } from './prisma';
import { hedgeAndExecute, type HedgeRequest, type HedgeResult } from './hedge-simple';
import { HEDGE_CONFIG } from './hedge-config';

/**
 * Order Routing Modes
 */
export enum OrderRoutingMode {
    ABOOK = 'ABOOK', // Direct hedge on Polymarket (Middleware mode)
    BBOOK = 'BBOOK', // Internal risk (AMM mode)
}

/**
 * Order Orchestrator
 * 
 * Responsible for deciding whether to route an order to Polymarket (A-Book)
 * or keep it internal (B-Book).
 */
export class OrderOrchestrator {
    /**
     * Determine the routing mode for a trade
     * Currently forced to 100% ABOOK for Polymarket sources
     */
    static async getRoutingMode(eventId: string): Promise<OrderRoutingMode> {
        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { source: true }
        });

        // If it's a Polymarket event, use A-Book by default
        if (event?.source === 'POLYMARKET') {
            return OrderRoutingMode.ABOOK;
        }

        // For internal events, use B-Book
        return OrderRoutingMode.BBOOK;
    }

    /**
     * Process a trade request
     */
    static async processOrder(request: HedgeRequest): Promise<HedgeResult> {
        const mode = await this.getRoutingMode(request.eventId);

        if (mode === OrderRoutingMode.ABOOK) {
            console.log(`[Orchestrator] Routing to A-BOOK (Polymarket) for user ${request.userId}`);
            return await this.executeABook(request);
        } else {
            console.log(`[Orchestrator] Routing to B-BOOK (Internal) for user ${request.userId}`);
            return await this.executeBBook(request);
        }
    }

    /**
     * A-BOOK: Execute via Polymarket (Middleware with spread/fee)
     */
    private static async executeABook(request: HedgeRequest): Promise<HedgeResult> {
        // hedgeAndExecute in hedge-simple.ts already performs the middleware logic:
        // 1. Fetch PM price
        // 2. Add spread
        // 3. Place PM hedge
        // 4. Record local trade
        return await hedgeAndExecute(request);
    }

    /**
     * B-BOOK: Execute via Internal AMM (Internalized risk)
     */
    private static async executeBBook(request: HedgeRequest): Promise<HedgeResult> {
        // This is where we will implement internal risk internalization
        // For now, it throws because user wants 100% middleware for Polymarket
        throw new Error('B-BOOK model not yet implemented for this event type');
    }
}
