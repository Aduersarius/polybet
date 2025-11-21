import { initLogger } from 'braintrust';

let logger: any = null;

export function getLogger() {
    if (!logger) {
        logger = initLogger({
            projectName: 'polybet',
            projectId: process.env.BRAINTRUST_PROJECT_ID,
            apiKey: process.env.BRAINTRUST_API_KEY,
        });
    }
    return logger;
}

export async function logPrediction(input: any, output: any, metadata?: any) {
    const logger = getLogger();
    return logger.log({
        input,
        output,
        metadata: {
            ...metadata,
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
        },
    });
}

export async function logEventAction(action: string, eventId: string, userId?: string, metadata?: any) {
    return logPrediction(
        { action, eventId, userId },
        { logged: true },
        {
            ...metadata,
            type: 'event_action',
            action,
        }
    );
}

export async function logBetPlacement(betData: any, metadata?: any) {
    return logPrediction(
        betData,
        { betPlaced: true },
        {
            ...metadata,
            type: 'bet_placement',
        }
    );
}