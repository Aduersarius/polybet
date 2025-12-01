-- Create dev user if not exists (use a unique email to avoid conflicts)
INSERT INTO "User" (id, username, email)
VALUES ('dev-user', 'Dev User', 'dev-user-' || EXTRACT(epoch FROM NOW()) || '@example.com')
ON CONFLICT (id) DO NOTHING;

-- Ensure dev user has balance
INSERT INTO "Balance" (userId, tokenSymbol, amount) VALUES ('dev-user', 'TUSD', 10000.0)
ON CONFLICT (userId, tokenSymbol, eventId)
DO UPDATE SET amount = GREATEST("Balance".amount, 10000.0);