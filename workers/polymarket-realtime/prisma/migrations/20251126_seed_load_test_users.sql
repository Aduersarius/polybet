-- Batch User Seed for Performance Testing
-- Creates 500 pre-made users to eliminate user creation overhead during load tests

DO $$
DECLARE
    i INTEGER;
BEGIN
    -- Check if users already exist
    IF (SELECT COUNT(*) FROM "User" WHERE id LIKE 'load-test-%') < 500 THEN
        -- Create 500 load test users
        FOR i IN 1..500 LOOP
            INSERT INTO "User" (id, username, address, "createdAt", "updatedAt")
            VALUES (
                'load-test-' || i,
                'LoadTest_' || i,
                '0xLoadTest' || LPAD(i::TEXT, 6, '0'),
                NOW(),
                NOW()
            )
            ON CONFLICT (id) DO NOTHING;
        END LOOP;
        
        RAISE NOTICE 'Created 500 load test users';
    ELSE
        RAISE NOTICE 'Load test users already exist, skipping';
    END IF;
END $$;

-- Verify creation
SELECT COUNT(*) as load_test_users 
FROM "User" 
WHERE id LIKE 'load-test-%';
