-- Create the multiple outcome event
INSERT INTO "Event" (id, title, description, categories, "resolutionDate", status, "creatorId", "createdAt", "updatedAt", "initialLiquidity", "liquidityParameter", type)
VALUES ('tech-trillion-race', 'Which company will hit $1T market cap first?', 'Predict which tech giant will reach the $1 trillion valuation milestone first. This event will resolve when any of the companies reaches this milestone.', '{TECH,BUSINESS}', '2026-12-31 23:59:59+00', 'ACTIVE', 'dev-user', NOW(), NOW(), 500.0, 15000.0, 'MULTIPLE');

-- Create outcomes for the event
INSERT INTO "Outcome" ("eventId", name, probability, liquidity, color, "createdAt", "updatedAt") VALUES
('tech-trillion-race', 'Apple', 0.25, 100.0, '#000000', NOW(), NOW()),
('tech-trillion-race', 'Nvidia', 0.30, 120.0, '#76B900', NOW(), NOW()),
('tech-trillion-race', 'Google', 0.20, 80.0, '#4285F4', NOW(), NOW()),
('tech-trillion-race', 'Amazon', 0.15, 60.0, '#FF9900', NOW(), NOW()),
('tech-trillion-race', 'Tesla', 0.10, 40.0, '#CC0000', NOW(), NOW());