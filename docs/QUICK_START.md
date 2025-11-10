# Quick Start Guide

## Environment Modes

The CCXT Bot supports two modes for managing secrets:

| Mode | ENV Value | Secrets Source | Use Case |
|------|-----------|----------------|----------|
| **Workstation** | `workstation` | `.env` file | Local development |
| **Production** | `production`, `development`, `staging` | Doppler | Deployed environments |

## Local Development

### Option 1: Workstation Mode (Default)

```bash
# 1. Copy environment template
cd server
cp .env.example .env

# 2. Edit .env with your values
nano .env

# 3. Run the server
npm run dev
```

### Option 2: Docker Compose

```bash
# Start all services (uses workstation mode by default)
docker compose up -d

# View logs
docker compose logs -f server

# Stop services
docker compose down
```

### Option 3: With Doppler

```bash
cd server

# Login to Doppler
doppler login

# Setup project
doppler setup

# Run with Doppler
npm run dev:doppler
```

## Production Deployment

### Prerequisites

1. Docker registry (e.g., Docker Hub, GCR, ECR)
2. Kubernetes cluster
3. Helm 3.0+
4. Doppler service token

### Build and Push

```bash
# Build server image
cd server
docker build -t your-registry/ccxt-bot-server:v1.0.0 .

# Push to registry
docker push your-registry/ccxt-bot-server:v1.0.0
```

### Deploy to Kubernetes

```bash
# Deploy with Helm
helm upgrade --install ccxt-bot ./helm \
  -f ./helm/values-prod.yaml \
  --namespace trading --create-namespace \
  --set server.doppler.token="dp.st.prod.XXXXX" \
  --set server.image.repository="your-registry/ccxt-bot-server" \
  --set server.image.tag="v1.0.0" \
  --set ingress.host="ccxt-bot.yourdomain.com"

# Check deployment status
kubectl get pods -n trading -w
```

## Switching Between Modes

### Docker Compose: Switch to Doppler

```bash
export ENV=production
export DOPPLER_TOKEN="dp.st.prod.XXXXX"
docker compose up -d
```

### Docker Compose: Switch to Workstation

```bash
export ENV=workstation
unset DOPPLER_TOKEN
docker compose up -d
```

## Available NPM Scripts

```bash
npm start              # Production start (respects ENV variable)
npm run dev            # Development with .env (ENV=workstation)
npm run dev:doppler    # Development with Doppler
npm run start:workstation  # Explicit workstation mode
```

## Environment Variables

### For Workstation Mode

Set in [server/.env](server/.env):
```env
DB_URL=mongodb://root:password@localhost:27017/ccxt-bot?authSource=admin
```

### For Doppler Mode

Set via environment or Helm:
```bash
ENV=production
DOPPLER_TOKEN=dp.st.prod.XXXXXXXXXXXXX
```

## Verification

Check the server logs for bootstrap messages:

**Workstation Mode:**
```
[Bootstrap] Environment mode: workstation
[Bootstrap] Loading environment from .env file...
[Bootstrap] ✓ Environment loaded from .env
```

**Doppler Mode:**
```
[Bootstrap] Environment mode: production
[Bootstrap] Using Doppler-injected environment variables
[Bootstrap] ✓ All required environment variables present
```

## Common Commands

```bash
# Build Docker image
docker build -t ccxt-bot-server ./server

# Run Helm chart locally
helm template ccxt-bot ./helm -f ./helm/values-dev.yaml

# Validate Helm chart
helm lint ./helm -f ./helm/values-dev.yaml

# Test Doppler connection
doppler secrets

# Export Doppler secrets to .env
doppler secrets download --no-file --format env > server/.env
```

## Troubleshooting

### Server won't start - "Missing required environment variables"

**Solution**: Set `ENV=workstation` or provide `DOPPLER_TOKEN`

```bash
ENV=workstation npm start
```

### Docker container exits immediately

**Solution**: Check logs and ensure ENV is set correctly

```bash
docker compose logs server
```

### Helm deployment fails

**Solution**: Verify Doppler token is set

```bash
helm upgrade --install ccxt-bot ./helm \
  -f ./helm/values-prod.yaml \
  --set server.doppler.token="YOUR_TOKEN" \
  --dry-run --debug
```

## Next Steps

- Read [DOPPLER_INTEGRATION.md](DOPPLER_INTEGRATION.md) for detailed Doppler setup
- Read [helm/README.md](helm/README.md) for Kubernetes deployment details
- Read [CLAUDE.md](CLAUDE.md) for architecture and development guide
