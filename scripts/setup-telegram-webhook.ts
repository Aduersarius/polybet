/**
 * Telegram Webhook Setup Script
 * Register webhook URL with Telegram Bot API
 * 
 * Usage:
 *   npx tsx scripts/setup-telegram-webhook.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.TELEGRAM_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set in .env file');
  process.exit(1);
}

if (!WEBHOOK_URL) {
  console.error('❌ TELEGRAM_WEBHOOK_URL is not set in .env file');
  console.error('   Example: https://yourdomain.com/api/telegram/webhook');
  process.exit(1);
}

async function setupWebhook() {
  const baseUrl = `https://api.telegram.org/bot${BOT_TOKEN}`;

  try {
    console.log('🔧 Setting up Telegram webhook...');
    console.log(`📡 Webhook URL: ${WEBHOOK_URL}`);

    // Set webhook
    const response = await fetch(`${baseUrl}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: false,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error('❌ Failed to set webhook:');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('✅ Webhook set successfully!');
    console.log(data.description);

    // Get webhook info to verify
    console.log('\n📊 Verifying webhook...');
    const infoResponse = await fetch(`${baseUrl}/getWebhookInfo`);
    const info = await infoResponse.json();

    if (info.ok) {
      console.log('\n📋 Webhook Info:');
      console.log(`   URL: ${info.result.url}`);
      console.log(`   Pending updates: ${info.result.pending_update_count}`);
      console.log(`   Max connections: ${info.result.max_connections}`);
      
      if (info.result.last_error_date) {
        console.log(`   ⚠️  Last error: ${info.result.last_error_message}`);
        console.log(`   Last error date: ${new Date(info.result.last_error_date * 1000).toISOString()}`);
      } else {
        console.log('   ✅ No errors');
      }

      if (info.result.allowed_updates) {
        console.log(`   Allowed updates: ${info.result.allowed_updates.join(', ')}`);
      }
    }

    console.log('\n✨ Setup complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Test your bot by sending a message on Telegram');
    console.log('   2. Check your server logs for webhook events');
    console.log('   3. Try bot commands: /start, /help, /link, /ticket');

  } catch (error) {
    console.error('❌ Error setting up webhook:');
    console.error(error);
    process.exit(1);
  }
}

async function deleteWebhook() {
  const baseUrl = `https://api.telegram.org/bot${BOT_TOKEN}`;

  try {
    console.log('🗑️  Deleting webhook...');

    const response = await fetch(`${baseUrl}/deleteWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drop_pending_updates: false,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error('❌ Failed to delete webhook:');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('✅ Webhook deleted successfully!');
  } catch (error) {
    console.error('❌ Error deleting webhook:');
    console.error(error);
    process.exit(1);
  }
}

async function getWebhookInfo() {
  const baseUrl = `https://api.telegram.org/bot${BOT_TOKEN}`;

  try {
    console.log('📊 Getting webhook info...\n');

    const response = await fetch(`${baseUrl}/getWebhookInfo`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.error('❌ Failed to get webhook info:');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    const info = data.result;

    console.log('📋 Webhook Info:');
    console.log(`   URL: ${info.url || '(not set)'}`);
    console.log(`   Has custom certificate: ${info.has_custom_certificate}`);
    console.log(`   Pending updates: ${info.pending_update_count}`);
    console.log(`   Max connections: ${info.max_connections}`);

    if (info.ip_address) {
      console.log(`   IP address: ${info.ip_address}`);
    }

    if (info.last_error_date) {
      console.log(`\n   ⚠️  Last error: ${info.last_error_message}`);
      console.log(`   Last error date: ${new Date(info.last_error_date * 1000).toISOString()}`);
    } else {
      console.log('\n   ✅ No errors');
    }

    if (info.last_synchronization_error_date) {
      console.log(`   Last sync error: ${new Date(info.last_synchronization_error_date * 1000).toISOString()}`);
    }

    if (info.allowed_updates) {
      console.log(`\n   Allowed updates: ${info.allowed_updates.join(', ')}`);
    }

  } catch (error) {
    console.error('❌ Error getting webhook info:');
    console.error(error);
    process.exit(1);
  }
}

// Parse command line arguments
const command = process.argv[2];

switch (command) {
  case 'setup':
  case undefined:
    setupWebhook();
    break;
  case 'delete':
    deleteWebhook();
    break;
  case 'info':
    getWebhookInfo();
    break;
  default:
    console.log('Usage:');
    console.log('  npx tsx scripts/setup-telegram-webhook.ts [command]');
    console.log('\nCommands:');
    console.log('  setup (default) - Set up webhook');
    console.log('  delete          - Delete webhook');
    console.log('  info            - Get webhook info');
    process.exit(1);
}
