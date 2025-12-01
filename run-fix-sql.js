const { Client } = require('pg');
const fs = require('fs');

async function runSQL() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/polybet',
    });

    try {
        await client.connect();
        console.log('Connected to database');

        const sql = fs.readFileSync('fix-locked-docs-table.sql', 'utf8');
        const statements = sql.split(';').filter(stmt => stmt.trim());

        for (const statement of statements) {
            if (statement.trim()) {
                console.log('Executing:', statement.trim());
                const result = await client.query(statement);
                if (result.rows && result.rows.length > 0) {
                    console.log('Result:');
                    result.rows.forEach(row => console.log(' ', row.column_name));
                }
            }
        }

        console.log('✅ SQL execution completed');
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.end();
    }
}

runSQL();