const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet?sslmode=disable'
});

async function createMultipleEvents() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Create dev user if not exists
    await client.query(`
      INSERT INTO "User" (id, username, email, "createdAt", "updatedAt")
      VALUES ('dev-user', 'Dev User', 'dev-user-' || EXTRACT(epoch FROM NOW()) || '@example.com', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);

    // Ensure dev user has balance
    try {
      await client.query(`
        INSERT INTO "Balance" ("userId", "tokenSymbol", amount) VALUES ('dev-user', 'TUSD', 10000.0)
      `);
    } catch (error) {
      // Balance might already exist, that's fine
      console.log('Balance insert skipped (might already exist)');
    }

    console.log('Dev user created/updated');

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
      INSERT INTO "Outcome" (id, "eventId", name, probability, liquidity, color, "createdAt", "updatedAt")
      VALUES
      (gen_random_uuid(), 'tech-trillion-race', 'Apple', 0.25, 10000.0, '#000000', NOW(), NOW()),
      (gen_random_uuid(), 'tech-trillion-race', 'Nvidia', 0.30, 10000.0, '#76B900', NOW(), NOW()),
      (gen_random_uuid(), 'tech-trillion-race', 'Google', 0.20, 10000.0, '#4285F4', NOW(), NOW()),
      (gen_random_uuid(), 'tech-trillion-race', 'Amazon', 0.15, 10000.0, '#FF9900', NOW(), NOW()),
      (gen_random_uuid(), 'tech-trillion-race', 'Tesla', 0.10, 10000.0, '#CC0000', NOW(), NOW())
      ON CONFLICT ("eventId", name) DO NOTHING
    `);

    // Create outcomes for largest company June
    await client.query(`
      INSERT INTO "Outcome" (id, "eventId", name, probability, liquidity, color, "createdAt", "updatedAt")
      VALUES
      (gen_random_uuid(), 'largest-company-june-2025', 'Microsoft', 0.22, 10000.0, '#00BCF2', NOW(), NOW()),
      (gen_random_uuid(), 'largest-company-june-2025', 'Apple', 0.20, 10000.0, '#000000', NOW(), NOW()),
      (gen_random_uuid(), 'largest-company-june-2025', 'Samsung', 0.18, 10000.0, '#1428A0', NOW(), NOW()),
      (gen_random_uuid(), 'largest-company-june-2025', 'Google', 0.15, 10000.0, '#4285F4', NOW(), NOW()),
      (gen_random_uuid(), 'largest-company-june-2025', 'Amazon', 0.12, 10000.0, '#FF9900', NOW(), NOW()),
      (gen_random_uuid(), 'largest-company-june-2025', 'Meta', 0.08, 10000.0, '#1877F2', NOW(), NOW()),
      (gen_random_uuid(), 'largest-company-june-2025', 'Tesla', 0.05, 10000.0, '#CC0000', NOW(), NOW())
      ON CONFLICT ("eventId", name) DO NOTHING
    `);

    // Create outcomes for US presidential election
    await client.query(`
      INSERT INTO "Outcome" (id, "eventId", name, probability, liquidity, color, "createdAt", "updatedAt")
      VALUES
      (gen_random_uuid(), 'us-presidential-2024', 'Donald Trump', 0.48, 10000.0, '#C8102E', NOW(), NOW()),
      (gen_random_uuid(), 'us-presidential-2024', 'Kamala Harris', 0.45, 10000.0, '#0033A0', NOW(), NOW()),
      (gen_random_uuid(), 'us-presidential-2024', 'Other', 0.07, 10000.0, '#666666', NOW(), NOW())
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