const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable'
});

async function createMultipleEvents() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Create multiple outcome events
    await client.query(`
      INSERT INTO "Event" (id, title, description, categories, "resolutionDate", status, "creatorId", "createdAt", "updatedAt", "initialLiquidity", "liquidityParameter", type)
      VALUES
      ('tech-trillion-race', 'Which company will hit $1T market cap first?', 'Predict which tech giant will reach the $1 trillion valuation milestone first. This event will resolve when any of the companies reaches this milestone.', '{TECH,BUSINESS}', '2026-12-31 23:59:59+00', 'ACTIVE', 'dev-user', NOW(), NOW(), 500.0, 15000.0, 'MULTIPLE'),
      ('largest-company-june-2025', 'Largest company by market cap end of June 2025?', 'Which company will have the highest market capitalization at the end of June 2025?', '{BUSINESS,FINANCE}', '2025-06-30 23:59:59+00', 'ACTIVE', 'dev-user', NOW(), NOW(), 300.0, 12000.0, 'MULTIPLE'),
      ('us-presidential-2024', 'Who will win the 2024 US Presidential Election?', 'Predict the winner of the 2024 United States Presidential Election.', '{POLITICS,ELECTIONS}', '2024-11-05 23:59:59+00', 'ACTIVE', 'dev-user', NOW(), NOW(), 600.0, 18000.0, 'MULTIPLE')
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        "initialLiquidity" = EXCLUDED."initialLiquidity",
        "liquidityParameter" = EXCLUDED."liquidityParameter"
    `);

    console.log('Created/updated events');

    // Create outcomes for tech trillion race
    await client.query(`
      INSERT INTO "Outcome" ("eventId", name, probability, liquidity, color, "createdAt", "updatedAt")
      VALUES
      ('tech-trillion-race', 'Apple', 0.25, 100.0, '#000000', NOW(), NOW()),
      ('tech-trillion-race', 'Nvidia', 0.30, 120.0, '#76B900', NOW(), NOW()),
      ('tech-trillion-race', 'Google', 0.20, 80.0, '#4285F4', NOW(), NOW()),
      ('tech-trillion-race', 'Amazon', 0.15, 60.0, '#FF9900', NOW(), NOW()),
      ('tech-trillion-race', 'Tesla', 0.10, 40.0, '#CC0000', NOW(), NOW())
      ON CONFLICT ("eventId", name) DO NOTHING
    `);

    // Create outcomes for largest company June
    await client.query(`
      INSERT INTO "Outcome" ("eventId", name, probability, liquidity, color, "createdAt", "updatedAt")
      VALUES
      ('largest-company-june-2025', 'Microsoft', 0.22, 80.0, '#00BCF2', NOW(), NOW()),
      ('largest-company-june-2025', 'Apple', 0.20, 75.0, '#000000', NOW(), NOW()),
      ('largest-company-june-2025', 'Nvidia', 0.18, 70.0, '#76B900', NOW(), NOW()),
      ('largest-company-june-2025', 'Google', 0.15, 60.0, '#4285F4', NOW(), NOW()),
      ('largest-company-june-2025', 'Amazon', 0.12, 50.0, '#FF9900', NOW(), NOW()),
      ('largest-company-june-2025', 'Meta', 0.08, 35.0, '#1877F2', NOW(), NOW()),
      ('largest-company-june-2025', 'Tesla', 0.05, 20.0, '#CC0000', NOW(), NOW())
      ON CONFLICT ("eventId", name) DO NOTHING
    `);

    // Create outcomes for US presidential election
    await client.query(`
      INSERT INTO "Outcome" ("eventId", name, probability, liquidity, color, "createdAt", "updatedAt")
      VALUES
      ('us-presidential-2024', 'Donald Trump', 0.48, 180.0, '#C8102E', NOW(), NOW()),
      ('us-presidential-2024', 'Kamala Harris', 0.45, 170.0, '#0033A0', NOW(), NOW()),
      ('us-presidential-2024', 'Other', 0.07, 30.0, '#666666', NOW(), NOW())
      ON CONFLICT ("eventId", name) DO NOTHING
    `);

    console.log('Successfully created multiple outcome events and outcomes!');

  } catch (error) {
    console.error('Error creating multiple outcome events:', error);
  } finally {
    await client.end();
  }
}

createMultipleEvents();