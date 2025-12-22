# Telegram Bot Setup Guide

This guide will help you set up the Telegram support bot for your PolyBet application.

## Prerequisites

- A Telegram account
- Access to your server's `.env` file
- Your application deployed with HTTPS (Telegram requires HTTPS for webhooks)

## Step 1: Create Bot with BotFather

1. Open Telegram and search for **@BotFather**
2. Start a conversation and send `/newbot`
3. Follow the prompts:
   - Choose a display name (e.g., "PolyBet Support")
   - Choose a username (must end with "bot", e.g., "polybet_support_bot")
4. **Save the bot token** that BotFather provides (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

## Step 2: Configure Bot Commands

Still in BotFather, set up bot commands:

1. Send `/setcommands` to BotFather
2. Select your bot
3. Send this list of commands:

```
start - Start interacting with support
help - Show available commands
ticket - View your open tickets
link - Link your Telegram to PolyBet account
```

## Step 3: Configure Environment Variables

Add these variables to your `.env` file:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/api/telegram/webhook
TELEGRAM_WEBHOOK_SECRET=your_random_secret_string_here
```

**Important:**
- Replace `your_bot_token_from_botfather` with the token from Step 1
- Replace `yourdomain.com` with your actual domain
- Generate a random secret for `TELEGRAM_WEBHOOK_SECRET` (e.g., use `openssl rand -hex 32`)
- The webhook URL must be HTTPS (Telegram requirement)

## Step 4: Update Database Schema

Run the Prisma migration to add the `linkCode` fields:

```bash
npx prisma db push
```

Or create and run a migration:

```bash
npx prisma migrate dev --name add-telegram-link-code
```

## Step 5: Register Webhook

Run the setup script to register your webhook with Telegram:

```bash
npx tsx scripts/setup-telegram-webhook.ts
```

You should see:
```
✅ Webhook set successfully!
📋 Webhook Info:
   URL: https://yourdomain.com/api/telegram/webhook
   Pending updates: 0
   ✅ No errors
```

### Troubleshooting Webhook Setup

**If you get an error:**

1. **Check your domain is accessible:**
   ```bash
   curl https://yourdomain.com/api/telegram/webhook
   ```
   Should return a 401 or similar (not a connection error)

2. **Verify your bot token:**
   ```bash
   curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe
   ```

3. **Check webhook info:**
   ```bash
   npx tsx scripts/setup-telegram-webhook.ts info
   ```

4. **Delete and recreate webhook:**
   ```bash
   npx tsx scripts/setup-telegram-webhook.ts delete
   npx tsx scripts/setup-telegram-webhook.ts setup
   ```

## Step 6: Test the Bot

1. **Find your bot** on Telegram (search for the username you created)

2. **Send `/start`** - You should get a welcome message

3. **Test commands:**
   - `/help` - Show help message
   - `/link` - Get a 6-digit code
   - Send a regular message - Should create a support ticket (requires linked account)

## Step 7: Link Your Account

1. In Telegram, send `/link` to your bot
2. Copy the 6-digit code
3. Go to `https://yourdomain.com/settings/telegram`
4. Enter the code and click "Link Account"
5. You should see "Account linked successfully!"

## Step 8: Test Two-Way Sync

1. **Create a ticket from Telegram:**
   - Send a message to the bot (e.g., "I need help with my account")
   - Bot should confirm ticket creation

2. **Reply from admin panel:**
   - Go to `/admin/support` on your website
   - Find the ticket
   - Send a reply
   - Check Telegram - you should receive the reply

3. **Reply from Telegram:**
   - Send another message in Telegram
   - Check admin panel - message should appear in the ticket

## Bot Commands Reference

### `/start`
- Displays welcome message
- Explains how to use the bot
- Shows available commands

### `/help`
- Shows detailed help information
- Lists all commands
- Explains account linking

### `/ticket`
- Lists user's open tickets
- Shows ticket numbers, subjects, and status
- Requires linked account

### `/link`
- Generates a 6-digit link code
- Code expires in 10 minutes
- Must enter code on website to complete linking

## Features

### For Users:
- ✅ Create support tickets by messaging the bot
- ✅ Receive instant replies from support agents
- ✅ Get notified about ticket status changes
- ✅ View open tickets with `/ticket` command
- ✅ Link Telegram to website account

### For Support Agents:
- ✅ Reply to tickets from admin panel
- ✅ Replies automatically sent to Telegram
- ✅ See message source (web or Telegram)
- ✅ Full ticket history and context

## Security Notes

1. **Keep your bot token secret** - Never commit it to version control
2. **Use a strong webhook secret** - Prevents unauthorized webhook calls
3. **HTTPS required** - Telegram only supports HTTPS webhooks
4. **Rate limiting** - Already implemented in the API
5. **Message validation** - All inputs are sanitized

## Monitoring

### Check Webhook Status:
```bash
npx tsx scripts/setup-telegram-webhook.ts info
```

### View Server Logs:
```bash
# Look for these log messages:
# - "Processing Telegram update"
# - "Sending Telegram notification"
# - "Webhook error" (if issues)
```

### Common Issues:

**Bot not responding:**
- Check webhook is registered: `npx tsx scripts/setup-telegram-webhook.ts info`
- Verify webhook URL is accessible
- Check server logs for errors

**Messages not syncing:**
- Verify account is linked (send `/link`)
- Check Telegram notification service is running
- Look for errors in server logs

**Link code not working:**
- Check code hasn't expired (10 minute limit)
- Verify user is logged into website
- Try generating a new code with `/link`

## Advanced Configuration

### Custom Bot Avatar:
1. Send `/setuserpic` to @BotFather
2. Select your bot
3. Upload a profile picture

### Bot Description:
1. Send `/setdescription` to @BotFather
2. Select your bot
3. Enter description (shown when users first start bot)

### About Text:
1. Send `/setabouttext` to @BotFather
2. Select your bot
3. Enter about text (shown in bot profile)

## Maintenance

### Update Webhook URL:
If you change domains, update the webhook:

```bash
# Update TELEGRAM_WEBHOOK_URL in .env
npx tsx scripts/setup-telegram-webhook.ts setup
```

### Disable Webhook (Development):
For local development, delete the webhook:

```bash
npx tsx scripts/setup-telegram-webhook.ts delete
```

Use polling instead of webhooks for local testing (requires code modification).

## Support

If you encounter issues:
1. Check the troubleshooting steps above
2. Review server logs for errors
3. Verify all environment variables are set correctly
4. Test webhook with: `curl -X POST https://yourdomain.com/api/telegram/webhook`
5. Check Telegram Bot API status: https://core.telegram.org/bots/api

## Next Steps

- [ ] Customize bot messages in `lib/telegram/telegram-service.ts`
- [ ] Add more bot commands as needed
- [ ] Set up monitoring alerts for bot failures
- [ ] Add analytics for bot usage
- [ ] Consider adding inline keyboards for better UX
