import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

export async function POST(request: NextRequest) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Create tables and add missing columns
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

      // Create the locked documents table
      `CREATE TABLE IF NOT EXISTS "payload_locked_documents" (
        "id" SERIAL PRIMARY KEY,
        "global_slug" VARCHAR(100),
        "updated_at" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "created_at" TIMESTAMP(3) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )`,

      // Create the locked documents relationships table
      `CREATE TABLE IF NOT EXISTS "payload_locked_documents_rels" (
        "id" SERIAL PRIMARY KEY,
        "order" INTEGER,
        "parent_id" INTEGER NOT NULL,
        "path" VARCHAR(500) NOT NULL
      )`,

      // Add missing columns to payload_locked_documents_rels table
      `ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "payload_users_id" INTEGER`,
      `ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "app_users_id" INTEGER`,
      `ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "payload_events_id" INTEGER`,
      `ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "media_id" INTEGER`,

      // Add basic indexes
      `CREATE INDEX IF NOT EXISTS "payload_preferences_rels_parent_idx" ON "payload_preferences_rels"("parent_id")`,
      `CREATE INDEX IF NOT EXISTS "payload_preferences_rels_path_idx" ON "payload_preferences_rels"("path")`,
      `CREATE INDEX IF NOT EXISTS "payload_preferences_key_idx" ON "payload_preferences"("key")`,
      `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels"("parent_id")`,
      `CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels"("path")`,
      `CREATE INDEX IF NOT EXISTS "payload_locked_documents_global_slug_idx" ON "payload_locked_documents"("global_slug")`
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