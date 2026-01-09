# HashiCorp Vault Integration Guide

## Why Vault?

**Problem:** Your private keys are currently in `.env` files:
```bash
CRYPTO_MASTER_MNEMONIC="club slogan present..."  # ❌ One leak = game over
```

**Solution:** Vault stores secrets encrypted and provides:
- ✅ **Encryption at rest** - Secrets stored encrypted
- ✅ **Access control** - Who can read which secrets
- ✅ **Audit logging** - Track who accessed what
- ✅ **Key rotation** - Change keys without downtime
- ✅ **Dynamic secrets** - Short-lived credentials

---

## Setup Options

### Option 1: HashiCorp Cloud (HCP Vault) - Easiest
**Best for:** Production, managed service
**Cost:** Free tier available, ~$50/month for production

1. Sign up: https://portal.cloud.hashicorp.com/sign-up
2. Create Vault cluster
3. Get address & token
4. Done!

### Option 2: Self-Hosted Vault - Free
**Best for:** Dev/staging, cost-conscious
**Requires:** Docker/server

```bash
# Run Vault in dev mode (NOT for production)
docker run --cap-add=IPC_LOCK -d -p 8200:8200 \
  --name=vault \
  -e 'VAULT_DEV_ROOT_TOKEN_ID=myroot' \
  vault:latest

# For production, use proper initialization
# See: https://developer.hashicorp.com/vault/tutorials/getting-started/getting-started-deploy
```

---

## Integration Steps

### 1. Install Vault NPM Package

```bash
npm install node-vault
```

### 2. Create Vault Secrets Manager

Create `lib/vault.ts`:

```typescript
import vault from 'node-vault';

const vaultClient = vault({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR || 'http://localhost:8200',
  token: process.env.VAULT_TOKEN
});

/**
 * Get secret from Vault with caching
 */
const secretCache = new Map<string, { value: string; expires: number }>();
const CACHE_TTL = 60000; // 1 minute

export async function getSecret(path: string): Promise<string> {
  // Check cache first
  const cached = secretCache.get(path);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  try {
    const result = await vaultClient.read(path);
    const value = result.data.data.value; // KV v2 format

    // Cache result
    secretCache.set(path, {
      value,
      expires: Date.now() + CACHE_TTL
    });

    return value;
  } catch (error) {
    console.error(`Failed to read secret ${path}:`, error);
    
    // Fallback to env var if Vault fails
    const envKey = path.split('/').pop()?.toUpperCase().replace(/-/g, '_');
    if (envKey && process.env[envKey]) {
      console.warn(`Using fallback env var ${envKey}`);
      return process.env[envKey]!;
    }
    
    throw new Error(`Secret ${path} not found in Vault or env`);
  }
}

/**
 * Clear secret cache (call on key rotation)
 */
export function clearSecretCache(path?: string) {
  if (path) {
    secretCache.delete(path);
  } else {
    secretCache.clear();
  }
}
```

### 3. Update Crypto Service

```typescript
// lib/crypto-service.ts
import { getSecret } from './vault';

export class CryptoService {
  private provider: ethers.JsonRpcProvider;
  private depositNode: ethers.HDNodeWallet | null = null;
  private hotNode: ethers.HDNodeWallet | null = null;

  async initialize() {
    // Load mnemonic from Vault instead of env
    const mnemonic = await getSecret('secret/crypto/master-mnemonic');
    
    this.depositNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, 'm');
    this.hotNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, 'm');
  }
  
  // ... rest of class
}

// Usage:
export async function getCryptoService(): Promise<CryptoService> {
  if (!cryptoServiceSingleton) {
    cryptoServiceSingleton = new CryptoService();
    await cryptoServiceSingleton.initialize();
  }
  return cryptoServiceSingleton;
}
```

### 4. Store Secrets in Vault

```bash
# Set Vault address & token
export VAULT_ADDR='https://your-vault-cluster.vault.hashicorp.cloud:8200'
export VAULT_TOKEN='hvs.your-token-here'

# Enable KV v2 secrets engine
vault secrets enable -path=secret kv-v2

# Store crypto mnemonic
vault kv put secret/crypto master-mnemonic="club slogan present donate..."

# Store Polygon RPC URL
vault kv put secret/polygon provider-url="https://polygon-mainnet.g.alchemy.com/..."

# Store Alchemy webhook key
vault kv put secret/webhook alchemy-signing-key="your-key-here"

# Verify
vault kv get secret/crypto
```

---

## Environment Variables

**Development (`.env.local`):**
```bash
# Vault connection
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=myroot

# Fallbacks (only for local dev)
CRYPTO_MASTER_MNEMONIC="club slogan present..."
POLYGON_PROVIDER_URL="https://..."
```

**Production (Vercel/Portainer):**
```bash
# Only Vault credentials needed
VAULT_ADDR=https://your-vault.vault.hashicorp.cloud:8200
VAULT_TOKEN=hvs.production-token

# No secrets in env vars! ✅
```

---

## Deployment

### Vercel (Next.js App)
1. Add to Vercel env vars:
   - `VAULT_ADDR`
   - `VAULT_TOKEN`
2. Deploy - secrets auto-loaded from Vault

### Portainer (Sweep Monitor)
1. Add to Docker env vars in Portainer UI:
   ```
   VAULT_ADDR=https://...
   VAULT_TOKEN=hvs...
   ```
2. Update `worker.ts` to load from Vault:
   ```typescript
   import { getSecret } from '../lib/vault';
   
   const MNEMONIC = await getSecret('secret/crypto/master-mnemonic');
   const PROVIDER_URL = await getSecret('secret/polygon/provider-url');
   ```

---

## Key Rotation

When rotating keys:

```bash
# 1. Generate new mnemonic
npx mnemonics # Or use hardware wallet

# 2. Store in Vault with NEW path
vault kv put secret/crypto-v2 master-mnemonic="new mnemonic..."

# 3. Update app config gradually
vault kv patch secret/crypto master-mnemonic="new mnemonic..."

# 4. Clear cache
curl -X POST https://your-app.com/api/admin/vault/clear-cache \
  -H "Authorization: Bearer admin-token"
  
# 5. Restart services
```

---

## Access Control (Optional - Production Hardening)

Create policies for different services:

```hcl
# Policy: sweep-monitor-policy
path "secret/data/crypto/*" {
  capabilities = ["read"]
}

path "secret/data/polygon/*" {
  capabilities = ["read"]
}
```

Apply policy:
```bash
vault policy write sweep-monitor sweep-monitor-policy.hcl
vault token create -policy=sweep-monitor
# Use this token in sweep-monitor only
```

---

## Benefits Summary

| Without Vault | With Vault |
|--------------|------------|
| Secrets in `.env` | Secrets encrypted |
| No audit trail | Full audit logs |
| Manual rotation | Automated rotation |
| Single point of failure | Resilient + fallback |
| Hard to rotate | Zero-downtime rotation |

---

## Implementation Timeline

**Week 1:** Setup & Testing
- Set up HCP Vault account
- Store secrets
- Test retrieval in dev

**Week 2:** Integration
- Update `crypto-service.ts`
- Update `sweep-monitor/worker.ts`
- Deploy to staging

**Week 3:** Production
- Migrate production secrets
- Deploy to production
- Remove secrets from `.env`

**Total effort:** ~8-12 hours
**ROI:** Massive security improvement

---

## Fallback Strategy

The integration includes env var fallback:
- If Vault is down, app uses `.env` (degraded mode)
- Logs warning
- Keeps working
- Auto-recovers when Vault is back

This ensures **zero production downtime** during Vault issues.
