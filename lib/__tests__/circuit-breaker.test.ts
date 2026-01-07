import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from '../circuit-breaker';

describe('CircuitBreaker', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
        breaker = new CircuitBreaker('test', {
            failureThreshold: 3,
            failureWindowMs: 5000,
            resetTimeoutMs: 1000,
            halfOpenSuccessThreshold: 2,
        });
    });

    describe('Initial State', () => {
        it('starts in CLOSED state', () => {
            expect(breaker.getState()).toBe('CLOSED');
        });

        it('allows requests in CLOSED state', () => {
            expect(breaker.isAllowed()).toBe(true);
        });
    });

    describe('Failure Tracking', () => {
        it('opens circuit after threshold failures', () => {
            breaker.onFailure();
            breaker.onFailure();
            expect(breaker.getState()).toBe('CLOSED');

            breaker.onFailure(); // 3rd failure
            expect(breaker.getState()).toBe('OPEN');
        });

        it('does not open circuit for failures outside window', async () => {
            // Create breaker with tiny window for testing
            const shortBreaker = new CircuitBreaker('short', {
                failureThreshold: 3,
                failureWindowMs: 50, // 50ms window
                resetTimeoutMs: 100,
                halfOpenSuccessThreshold: 1,
            });

            shortBreaker.onFailure();
            shortBreaker.onFailure();

            // Wait for failures to expire
            await new Promise(r => setTimeout(r, 60));

            shortBreaker.onFailure(); // This is only 1 failure in current window
            expect(shortBreaker.getState()).toBe('CLOSED');
        });
    });

    describe('OPEN State', () => {
        beforeEach(() => {
            // Open the circuit
            breaker.onFailure();
            breaker.onFailure();
            breaker.onFailure();
        });

        it('rejects requests in OPEN state', () => {
            expect(breaker.getState()).toBe('OPEN');
            expect(breaker.isAllowed()).toBe(false);
        });

        it('transitions to HALF_OPEN after reset timeout', async () => {
            expect(breaker.getState()).toBe('OPEN');

            // Wait for reset timeout
            await new Promise(r => setTimeout(r, 1100));

            // isAllowed triggers the transition
            expect(breaker.isAllowed()).toBe(true);
            expect(breaker.getState()).toBe('HALF_OPEN');
        });
    });

    describe('HALF_OPEN State', () => {
        beforeEach(async () => {
            // Open then wait for half-open
            breaker.onFailure();
            breaker.onFailure();
            breaker.onFailure();
            await new Promise(r => setTimeout(r, 1100));
            breaker.isAllowed(); // Trigger transition
        });

        it('closes circuit after success threshold', () => {
            expect(breaker.getState()).toBe('HALF_OPEN');

            breaker.onSuccess();
            expect(breaker.getState()).toBe('HALF_OPEN'); // Need 2

            breaker.onSuccess();
            expect(breaker.getState()).toBe('CLOSED');
        });

        it('reopens circuit on failure', () => {
            expect(breaker.getState()).toBe('HALF_OPEN');

            breaker.onFailure();
            expect(breaker.getState()).toBe('OPEN');
        });
    });

    describe('Execute Wrapper', () => {
        it('executes function when circuit is closed', async () => {
            const fn = vi.fn().mockResolvedValue('success');

            const result = await breaker.execute(fn);

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalled();
        });

        it('throws CircuitOpenError when circuit is open', async () => {
            // Open circuit
            breaker.onFailure();
            breaker.onFailure();
            breaker.onFailure();

            const fn = vi.fn().mockResolvedValue('success');

            await expect(breaker.execute(fn)).rejects.toThrow(CircuitOpenError);
            expect(fn).not.toHaveBeenCalled();
        });

        it('records failure when function throws', async () => {
            const fn = vi.fn().mockRejectedValue(new Error('API error'));

            await expect(breaker.execute(fn)).rejects.toThrow('API error');

            const stats = breaker.getStats();
            expect(stats.recentFailures).toBe(1);
        });

        it('records success when function succeeds', async () => {
            // Get to HALF_OPEN
            breaker.onFailure();
            breaker.onFailure();
            breaker.onFailure();
            await new Promise(r => setTimeout(r, 1100));
            breaker.isAllowed();

            const fn = vi.fn().mockResolvedValue('success');
            await breaker.execute(fn);
            await breaker.execute(fn);

            expect(breaker.getState()).toBe('CLOSED');
        });
    });

    describe('Reset', () => {
        it('force resets to CLOSED state', () => {
            breaker.onFailure();
            breaker.onFailure();
            breaker.onFailure();
            expect(breaker.getState()).toBe('OPEN');

            breaker.reset();

            expect(breaker.getState()).toBe('CLOSED');
            expect(breaker.getStats().recentFailures).toBe(0);
        });
    });

    describe('Stats', () => {
        it('returns correct statistics', () => {
            breaker.onFailure();
            breaker.onFailure();

            const stats = breaker.getStats();

            expect(stats.state).toBe('CLOSED');
            expect(stats.recentFailures).toBe(2);
            expect(stats.timeSinceStateChange).toBeGreaterThanOrEqual(0);
        });
    });
});
