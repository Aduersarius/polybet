import { test } from 'tap';
import { hasPermission } from '../lib/api-auth';
import { assertSameOrigin } from '../lib/csrf';

test('hasPermission allows admin and scoped permissions', async (t) => {
    const adminAuth = { permissions: ['admin'] };
    t.equal(hasPermission(adminAuth, 'write'), true, 'admin overrides');

    const scopedAuth = { permissions: ['trade', 'read'] };
    t.equal(hasPermission(scopedAuth, 'trade'), true, 'trade included');
    t.equal(hasPermission(scopedAuth, 'write'), false, 'write not implied');
});

test('assertSameOrigin rejects untrusted origins in production', async (t) => {
    const req = new Request('https://pariflow.com/api/user/favorites', {
        headers: {
            origin: 'https://attacker.com',
        },
    });

    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    let rejected = false;
    try {
        assertSameOrigin(req);
    } catch (err) {
        rejected = true;
        if (err instanceof Response) {
            t.equal(err.status, 403, 'rejects with 403 Response');
        } else {
            t.match(String(err), /CSRF check failed|Origin required/, 'rejects mismatched origins');
        }
    } finally {
        process.env.NODE_ENV = originalEnv;
    }

    t.equal(rejected, true, 'origin was rejected');
});
