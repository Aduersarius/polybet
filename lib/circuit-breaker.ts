/**
 * Circuit Breaker Pattern for Polymarket API
 * 
 * Prevents cascade failures when Polymarket is unavailable by:
 * - Tracking consecutive failures
 * - Opening circuit after threshold reached (fast-fail mode)
 * - Auto-resetting after timeout to test if service recovered
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service unavailable, requests fail immediately
 * - HALF_OPEN: Testing if service recovered, allow single request
 */
import { registerCircuitBreakerGauge } from './metrics';
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
    failureThreshold: number;     // Number of failures to open circuit
    failureWindowMs: number;      // Time window for counting failures
    resetTimeoutMs: number;       // Time to wait before testing recovery
    halfOpenSuccessThreshold: number; // Successes needed to close circuit
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,          // 5 failures
    failureWindowMs: 60_000,      // in 1 minute
    resetTimeoutMs: 30_000,       // wait 30 seconds before testing
    halfOpenSuccessThreshold: 2,  // 2 successful requests to close
};

export class CircuitBreaker {
    private state: CircuitState = 'CLOSED';
    private failures: number[] = []; // Timestamps of recent failures
    private lastStateChange: number = Date.now();
    private halfOpenSuccesses: number = 0;
    private config: CircuitBreakerConfig;
    private name: string;

    constructor(name: string = 'polymarket', config: Partial<CircuitBreakerConfig> = {}) {
        this.name = name;
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Register this instance with the metrics gauge if it's the main polymarket one
        // (We check the name to avoid registering multiple callbacks if multiple instances are created)
        if (name === 'polymarket') {
            registerCircuitBreakerGauge((result) => {
                let stateValue = 0;
                if (this.state === 'OPEN') stateValue = 1;
                if (this.state === 'HALF_OPEN') stateValue = 2;
                result.observe(stateValue, { name: this.name });
            });
        }
    }

    /**
     * Get current circuit state
     */
    getState(): CircuitState {
        return this.state;
    }

    /**
     * Check if circuit allows requests
     */
    isAllowed(): boolean {
        this.cleanOldFailures();

        switch (this.state) {
            case 'CLOSED':
                return true;

            case 'OPEN':
                // Check if reset timeout has passed
                if (Date.now() - this.lastStateChange >= this.config.resetTimeoutMs) {
                    this.transitionTo('HALF_OPEN');
                    return true;
                }
                return false;

            case 'HALF_OPEN':
                // Allow requests to test if service recovered
                return true;
        }
    }

    /**
     * Execute a function with circuit breaker protection
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (!this.isAllowed()) {
            const remainingMs = this.config.resetTimeoutMs - (Date.now() - this.lastStateChange);
            throw new CircuitOpenError(
                `Circuit breaker OPEN for ${this.name} - Polymarket unavailable. ` +
                `Retry in ${Math.ceil(remainingMs / 1000)}s`
            );
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    /**
     * Record a successful operation
     */
    onSuccess(): void {
        switch (this.state) {
            case 'HALF_OPEN':
                this.halfOpenSuccesses++;
                console.log(`[CircuitBreaker:${this.name}] HALF_OPEN success ${this.halfOpenSuccesses}/${this.config.halfOpenSuccessThreshold}`);

                if (this.halfOpenSuccesses >= this.config.halfOpenSuccessThreshold) {
                    this.transitionTo('CLOSED');
                }
                break;

            case 'CLOSED':
                // Clear old failures on success (optional: sliding window already handles this)
                break;
        }
    }

    /**
     * Record a failed operation
     */
    onFailure(): void {
        const now = Date.now();
        this.failures.push(now);
        this.cleanOldFailures();

        switch (this.state) {
            case 'CLOSED':
                console.log(`[CircuitBreaker:${this.name}] Failure recorded (${this.failures.length}/${this.config.failureThreshold})`);

                if (this.failures.length >= this.config.failureThreshold) {
                    this.transitionTo('OPEN');
                }
                break;

            case 'HALF_OPEN':
                // Single failure in half-open returns to open
                console.log(`[CircuitBreaker:${this.name}] Failure in HALF_OPEN, reopening circuit`);
                this.transitionTo('OPEN');
                break;
        }
    }

    /**
     * Transition to a new state
     */
    private transitionTo(newState: CircuitState): void {
        const oldState = this.state;
        this.state = newState;
        this.lastStateChange = Date.now();

        // Reset counters on state transition
        if (newState === 'HALF_OPEN') {
            this.halfOpenSuccesses = 0;
        } else if (newState === 'CLOSED') {
            this.failures = [];
            this.halfOpenSuccesses = 0;
        }

        console.log(`[CircuitBreaker:${this.name}] State transition: ${oldState} → ${newState}`);
    }

    /**
     * Remove failures older than the window
     */
    private cleanOldFailures(): void {
        const cutoff = Date.now() - this.config.failureWindowMs;
        this.failures = this.failures.filter(ts => ts > cutoff);
    }

    /**
     * Force reset circuit (admin use)
     */
    reset(): void {
        this.failures = [];
        this.halfOpenSuccesses = 0;
        this.transitionTo('CLOSED');
        console.log(`[CircuitBreaker:${this.name}] Force reset to CLOSED`);
    }

    /**
     * Get circuit statistics
     */
    getStats(): {
        state: CircuitState;
        recentFailures: number;
        timeSinceStateChange: number;
        halfOpenSuccesses: number;
    } {
        this.cleanOldFailures();
        return {
            state: this.state,
            recentFailures: this.failures.length,
            timeSinceStateChange: Date.now() - this.lastStateChange,
            halfOpenSuccesses: this.halfOpenSuccesses,
        };
    }
}

/**
 * Custom error for circuit open state
 */
export class CircuitOpenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CircuitOpenError';
    }
}

// Export singleton instance for Polymarket
export const polymarketCircuit = new CircuitBreaker('polymarket', {
    failureThreshold: 5,
    failureWindowMs: 60_000,
    resetTimeoutMs: 30_000,
    halfOpenSuccessThreshold: 2,
});
