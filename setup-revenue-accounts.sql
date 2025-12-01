-- Set up treasury balance (assuming treasury-admin user exists)
INSERT INTO "Balance" (userId, tokenSymbol, amount) VALUES ('treasury-admin', 'TUSD', 1000.0)
ON CONFLICT (userId, tokenSymbol, eventId) DO UPDATE SET amount = GREATEST("Balance".amount, 1000.0);

-- Set up AMM bot balance (assuming amm-bot user exists)
INSERT INTO "Balance" (userId, tokenSymbol, amount) VALUES ('amm-bot', 'TUSD', 100000.0)
ON CONFLICT (userId, tokenSymbol, eventId) DO UPDATE SET amount = GREATEST("Balance".amount, 100000.0);