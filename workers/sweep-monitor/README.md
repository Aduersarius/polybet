# Sweep Monitor Worker

Monitors deposit addresses for USDC and USDC.e deposits, automatically sweeps funds to master wallet, and credits users.

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `POLYGON_PROVIDER_URL` - Polygon RPC endpoint (Alchemy/Infura)
- `CRYPTO_MASTER_MNEMONIC` - BIP39 mnemonic for wallet derivation
- `MASTER_WALLET_ADDRESS` - Master wallet address to receive swept funds

Optional:
- `SWEEP_CHECK_INTERVAL_MS` - How often to check for deposits (default: 60000ms / 1 minute)

## Running Locally

```bash
npm install
npm run dev
```

## Running in Docker

```bash
docker build -f Dockerfile -t sweep-monitor:latest ../..
docker run --env-file .env sweep-monitor:latest
```

## Deployment (Portainer)

The image is automatically built and pushed to GitHub Container Registry on every commit to `main` branch.

Pull from: `ghcr.io/aduersarius/polybet/sweep-monitor:latest`
