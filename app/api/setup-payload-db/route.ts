import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

export async function POST(request: NextRequest) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Execute statements one by one to identify the failing one
    const statements = [
      // Create tables first
      `CREATE TABLE IF NOT EXISTS "payload_preferences_rels" (
        "id" SERIAL,
        "order" INTEGER,
        "parent_id" INTEGER NOT NULL,
        "path" VARCHAR(500) NOT NULL,
        "payload_users_id" INTEGER,
        PRIMARY KEY ("id")
      )`,

      `CREATE TABLE IF NOT EXISTS "payload_locked_documents_rels" (
        "id" SERIAL,
        "order" INTEGER,
        "parent_id" INTEGER NOT NULL,
        "path" VARCHAR(500) NOT NULL,
        "payload_users_id" INTEGER,
        "app_users_id" INTEGER,
        "payload_events_id" INTEGER,
        "media_id" INTEGER,
        PRIMARY KEY ("id")
      )`,

      `CREATE TABLE IF NOT EXISTS "payload_locked_documents" (
        "id" SERIAL,
        "global_slug" VARCHAR(100),
        "updated_at" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "created_at" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id")
      )`,

      `CREATE TABLE IF NOT EXISTS "payload_preferences" (
        "id" SERIAL,
        "key" VARCHAR(255),
        "value" JSONB,
        "updated_at" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "created_at" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("id")
      )`,

      // Add indexes
      `CREATE INDEX IF NOT EXISTS "payload_preferences_rels_parent_idx" ON "payload_preferences_rels"("parent_id")`,
      `CREATE INDEX IF NOT EXISTS "payload_preferences_rels_path_idx" ON "payload_preferences_rels"("path")`,
      `CREATE INDEX IF NOT EXISTS "payload_preferences_rels_payload_users_id_idx" ON "payload_preferences_rels"("payload_users_id")`,

      `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels"("parent_id")`,
      `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels"("path")`,
      `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_payload_users_id_idx" ON "payload_locked_documents_rels"("payload_users_id")`,
      `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_app_users_id_idx" ON "payload_locked_documents_rels"("app_users_id")`,
      `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_payload_events_id_idx" ON "payload_locked_documents_rels"("payload_events_id")`,
      `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels"("media_id")`,

      `CREATE INDEX IF NOT EXISTS "payload_locked_documents_global_slug_idx" ON "payload_locked_documents"("global_slug")`,
      `CREATE INDEX IF NOT EXISTS "payload_locked_documents_updated_at_idx" ON "payload_locked_documents"("updated_at")`,
      `CREATE INDEX IF NOT EXISTS "payload_locked_documents_created_at_idx" ON "payload_locked_documents"("created_at")`,

      `CREATE INDEX IF NOT EXISTS "payload_preferences_key_idx" ON "payload_preferences"("key")`,
      `CREATE INDEX IF NOT EXISTS "payload_preferences_updated_at_idx" ON "payload_preferences"("updated_at")`,
      `CREATE INDEX IF NOT EXISTS "payload_preferences_created_at_idx" ON "payload_preferences"("created_at")`,

      // Add foreign key constraints
      `ALTER TABLE "payload_preferences_rels"
       ADD CONSTRAINT IF NOT EXISTS "payload_preferences_rels_parent_id_fk"
       FOREIGN KEY ("parent_id") REFERENCES "payload_preferences"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,

      `ALTER TABLE "payload_locked_documents_rels"
       ADD CONSTRAINT IF NOT EXISTS "payload_locked_documents_rels_parent_id_fk"
       FOREIGN KEY ("parent_id") REFERENCES "payload_locked_documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    ];

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      try {
        console.log(`Executing statement ${i + 1}/${statements.length}`);
        await client.query(statements[i]);
      } catch (error) {
        console.error(`Failed on statement ${i + 1}:`, statements[i]);
        throw error;
      }
    }
    console.log('✅ SUCCESS: All Payload tables created!');

    // Verify tables exist
    const verifyTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'payload_%'
      ORDER BY table_name;
    `);

    const tables = verifyTables.rows.map(row => row.table_name);
    console.log('📋 Payload tables in database:', tables);

    return NextResponse.json({
      success: true,
      message: 'All Payload tables created successfully',
      tables: tables
    });

  } catch (error) {
    console.error('❌ ERROR:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}