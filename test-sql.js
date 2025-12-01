const { Client } = require('pg');

async function testSQL() {
    // Use local DATABASE_URL for testing
    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/polybet',
    });

    try {
        await client.connect();
        console.log('Connected to local database');

        // Just create the minimal tables that Payload needs
        const statements = [
            // Create the main missing table that's causing the error
            `CREATE TABLE IF NOT EXISTS "payload_preferences_rels" (
        "id" SERIAL PRIMARY KEY,
        "order" INTEGER,
        "parent_id" INTEGER NOT NULL,
        "path" VARCHAR(500) NOT NULL,
        "payload_users_id" INTEGER
      )`,

            // Create the preferences table if it doesn't exist
            `CREATE TABLE IF NOT EXISTS "payload_preferences" (
        "id" SERIAL PRIMARY KEY,
        "key" VARCHAR(255),
        "value" JSONB,
        "updated_at" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "created_at" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

            // Add basic indexes
            `CREATE INDEX IF NOT EXISTS "payload_preferences_rels_parent_idx" ON "payload_preferences_rels"("parent_id")`,
            `CREATE INDEX IF NOT EXISTS "payload_preferences_rels_path_idx" ON "payload_preferences_rels"("path")`,
            `CREATE INDEX IF NOT EXISTS "payload_preferences_key_idx" ON "payload_preferences"("key")`
        ];

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            try {
                console.log(`Executing statement ${i + 1}/${statements.length}`);
                await client.query(statements[i]);
                console.log(`✅ Statement ${i + 1} executed successfully`);
            } catch (error) {
                console.error(`❌ Failed on statement ${i + 1}:`, statements[i]);
                console.error('Error:', error.message);
                throw error;
            }
        }

        console.log('✅ All statements executed successfully!');

        // Verify tables exist
        const verifyTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'payload_%'
      ORDER BY table_name;
    `);

        console.log('📋 Payload tables in database:');
        verifyTables.rows.forEach(row => {
            console.log(`  - ${row.table_name}`);
        });

    } catch (error) {
        console.error('❌ ERROR:', error);
    } finally {
        await client.end();
        console.log('Database connection closed');
    }
}

testSQL();