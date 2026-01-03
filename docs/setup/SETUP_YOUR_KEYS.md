# 🔑 Setting Up Your Polymarket Keys

You have 4 keys. Here's what to do with each one:

## Add to `.env` file:

```bash
# ============================================
# YOUR POLYMARKET CREDENTIALS
# ============================================

# 1. API Key - For authentication
POLYMARKET_API_KEY=your_api_key_here

# 2. Secret - For signing API requests (HMAC)
POLYMARKET_API_SECRET=your_secret_here

# 3. Passphrase - Additional authentication layer
POLYMARKET_PASSPHRASE=your_passphrase_here

# 4. Wallet Private Key - For signing blockchain transactions
POLYMARKET_PRIVATE_KEY=your_wallet_private_key_here

# Polymarket API URL (don't change this)
POLYMARKET_CLOB_API_URL=https://clob.polymarket.com

# Polygon Chain ID (137 = mainnet, 80001 = testnet)
POLYMARKET_CHAIN_ID=137
```

## What Each Key Does:

### 1. API Key
- **Purpose**: Identifies your application to Polymarket
- **Used for**: All API requests
- **Format**: Usually a string like `abc123def456`

### 2. Secret
- **Purpose**: Creates secure signatures for API requests (HMAC)
- **Used for**: Signing requests to prove they come from you
- **Format**: Usually a long string

### 3. Passphrase
- **Purpose**: Additional security layer for API access
- **Used for**: Included in request headers
- **Format**: String, might be the password you set

### 4. Wallet Private Key
- **Purpose**: Signs blockchain transactions on Polygon
- **Used for**: Actually placing orders on-chain
- **Format**: Starts with `0x...` (64 hex characters)
- **⚠️ MOST SENSITIVE** - This controls your USDC!

## Security Checklist:

- ✅ `.env` file is in your project root
- ✅ `.env` is listed in `.gitignore` (already done)
- ✅ Never share these keys with anyone
- ✅ Never commit them to git
- ✅ Keep backups in a secure location

## Test Your Setup:

After adding keys to `.env`, run:

```bash
# Stop your dev server (Ctrl+C)

# Restart it
npm run dev

# In another terminal, run:
npx tsx scripts/init-hedging.ts
```

This will:
- ✓ Check if all keys are set
- ✓ Test connection to Polymarket
- ✓ Verify authentication works

## Expected Output:

```
🚀 Initializing Polymarket Hedging System...

✓ Checking environment variables...
  - POLYMARKET_CLOB_API_URL: ✓ Set
  - POLYMARKET_API_KEY: ✓ Set
  - POLYMARKET_API_SECRET: ✓ Set
  - POLYMARKET_PASSPHRASE: ✓ Set
  - POLYMARKET_PRIVATE_KEY: ✓ Set

✓ Testing Polymarket connection...
  Polymarket trading service initialized ✓
  Orderbook fetch test successful ✓

🎉 Hedging System Initialized Successfully!
```

## If You See Errors:

### "API Key not set"
→ Make sure you copied the key correctly to `.env`
→ Restart your dev server

### "Connection failed"
→ Check if keys are correct
→ Try with different API endpoint (testnet vs mainnet)

### "Authentication failed"
→ Secret or passphrase might be wrong
→ Double-check all 4 values

## Next Steps After Setup:

1. **Go to Admin Panel**
   ```
   http://localhost:3000/admin?view=hedging
   ```

2. **You should see:**
   - 🟢 System Status: Connected
   - Enable Hedging button

3. **Click "Enable Hedging"**

4. **Monitor the dashboard!**

---

## About Event Mapping (No Action Needed!)

**Good news**: Since you're already pulling events from Polymarket, mappings are **auto-created** now! ✨

When you fetch events from Polymarket, the system automatically:
1. Creates a mapping record in the database
2. Links your internal event ID to Polymarket's ID
3. Updates it every hour

**No manual SQL needed!** 🎉

Just fetch events normally and hedging will work automatically.

---

## Quick Start Commands:

```bash
# 1. Add your keys to .env file (see above)

# 2. Restart server
npm run dev

# 3. Test setup
npx tsx scripts/init-hedging.ts

# 4. Open admin panel
# Go to: http://localhost:3000/admin?view=hedging

# 5. Enable hedging
# Click the "Enable Hedging" button in the dashboard
```

---

**Ready to hedge!** 🚀

