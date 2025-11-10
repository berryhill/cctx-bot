# Doppler Integration Guide

This guide explains how the CCXT Bot conditionally uses Doppler for secrets management based on the environment.

## Overview

The server now supports two modes for loading environment variables:

1. **Workstation Mode** (`ENV=workstation`): Uses `.env` file for local development
2. **Production/Deployed Mode** (`ENV=production|development|staging`): Uses Doppler for secrets management

## Architecture

### Bootstrap System

The [server/bootstrap.js](server/bootstrap.js) file handles conditional environment loading:

```javascript
const env = process.env.ENV || 'workstation';

if (env === 'workstation') {
    // Load from .env file
    require('dotenv').config();
} else {
    // Expect Doppler-injected environment variables
    // Validates required variables are present
}
```

### Dockerfile

The [server/Dockerfile](server/Dockerfile) includes:
- Doppler CLI installation
- Conditional startup command that checks `ENV` and `DOPPLER_TOKEN`
- Falls back to direct execution if Doppler is not configured

## Usage

### Local Development (Workstation Mode)

#### Option 1: Direct Node.js

```bash
cd server

# Set ENV=workstation to use .env file
ENV=workstation npm run dev

# Or use the dedicated script
npm run dev  # Already sets ENV=workstation
```

#### Option 2: Docker Compose

```bash
# Default mode uses .env file (ENV=workstation by default)
docker compose up -d

# View logs
docker compose logs -f server
```

### Local Development with Doppler

Test Doppler integration locally:

```bash
cd server

# Make sure you're logged into Doppler
doppler login

# Setup the project
doppler setup

# Run with Doppler
npm run dev:doppler

# Or run directly
doppler run -- npm start
```

### Production Deployment (Kubernetes with Helm)

#### With Doppler Enabled (Recommended)

```bash
# Get your Doppler token from the dashboard
# https://dashboard.doppler.com/

# Deploy with Doppler
helm upgrade --install ccxt-bot ./helm \
  -f ./helm/values-prod.yaml \
  --namespace trading --create-namespace \
  --set server.doppler.token="dp.st.prod.XXXXXXXXXXXXX" \
  --set server.image.tag="v1.0.0"
```

#### Without Doppler (Manual Secrets)

To disable Doppler and use Kubernetes secrets directly:

```bash
# Edit values file to disable Doppler
# Set server.doppler.enabled: false in values-prod.yaml

helm upgrade --install ccxt-bot ./helm \
  -f ./helm/values-prod.yaml \
  --namespace trading --create-namespace \
  --set server.doppler.enabled=false \
  --set mongodb.rootPassword="YOUR_SECURE_PASSWORD" \
  --set server.image.tag="v1.0.0"
```

## Configuration Files

### [server/package.json](server/package.json)

Available npm scripts:

```json
{
  "start": "node index.js",                      // Production start
  "dev": "ENV=workstation nodemon index.js",     // Dev with .env
  "dev:doppler": "doppler run -- nodemon index.js", // Dev with Doppler
  "start:workstation": "ENV=workstation node index.js" // Explicit workstation mode
}
```

### [docker-compose.yml](docker-compose.yml)

Docker Compose configuration supports both modes:

```yaml
environment:
  - ENV=${ENV:-workstation}      # Default: workstation mode
  - DOPPLER_TOKEN=${DOPPLER_TOKEN:-}  # Optional: for Doppler mode
volumes:
  - ./server/.env:/app/.env:ro   # Mount .env for workstation mode
```

To use Doppler with Docker Compose:

```bash
# Set environment variables
export ENV=production
export DOPPLER_TOKEN="dp.st.prod.XXXXX"

# Start services
docker compose up -d
```

### Helm Chart

The Helm chart ([helm/templates/server-deployment.yaml](helm/templates/server-deployment.yaml)) conditionally sets environment variables:

- When `server.doppler.enabled=true`: Injects `DOPPLER_TOKEN`
- When `server.doppler.enabled=false`: Injects `DB_URL` and other secrets directly

## Environment Variables

### Required for All Modes

- `ENV`: Environment mode (`workstation`, `development`, `production`, `staging`)

### Required for Workstation Mode

Create [server/.env](server/.env):

```env
DB_URL=mongodb://root:PASSWORD@localhost:27017/ccxt-bot?authSource=admin&retryWrites=true&w=majority
# Add other secrets here
```

### Required for Doppler Mode

- `DOPPLER_TOKEN`: Your Doppler service token
- All secrets are fetched from Doppler automatically

## Doppler Setup

### 1. Install Doppler CLI

```bash
# macOS
brew install dopplerhq/cli/doppler

# Linux
(curl -Ls --tlsv1.2 --proto "=https" --retry 3 https://cli.doppler.com/install.sh || wget -t 3 -qO- https://cli.doppler.com/install.sh) | sudo sh

# Windows
scoop install doppler
```

### 2. Login and Setup

```bash
# Login to Doppler
doppler login

# Navigate to your project
cd server

# Setup the project (select project and config)
doppler setup
```

### 3. Configure Secrets in Doppler

Add these secrets to your Doppler project:

- `DB_URL`: MongoDB connection string
- Any other application secrets

### 4. Get Service Token

For production deployments:

1. Go to Doppler Dashboard: https://dashboard.doppler.com/
2. Select your project
3. Go to "Access" → "Service Tokens"
4. Create a token for your environment (production, staging, etc.)
5. Use the token in Helm deployment

## Verification

### Check Bootstrap Logs

When the server starts, you'll see bootstrap messages:

**Workstation Mode:**
```
[Bootstrap] Environment mode: workstation
[Bootstrap] Loading environment from .env file...
[Bootstrap] ✓ Environment loaded from .env
[Bootstrap] Environment initialization complete
```

**Doppler Mode:**
```
[Bootstrap] Environment mode: production
[Bootstrap] Using Doppler-injected environment variables
[Bootstrap] ✓ All required environment variables present
[Bootstrap] Environment initialization complete
```

### Test Locally

```bash
# Test workstation mode
cd server
ENV=workstation node index.js

# Test with Doppler
cd server
doppler run -- node index.js
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy with Doppler

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build Docker image
        run: |
          docker build -t your-registry/ccxt-bot-server:${{ github.sha }} ./server
          docker push your-registry/ccxt-bot-server:${{ github.sha }}

      - name: Deploy to Kubernetes
        run: |
          helm upgrade --install ccxt-bot ./helm \
            -f ./helm/values-prod.yaml \
            --namespace trading --create-namespace \
            --set server.doppler.token="${{ secrets.DOPPLER_TOKEN }}" \
            --set server.image.repository="your-registry/ccxt-bot-server" \
            --set server.image.tag="${{ github.sha }}"
```

Store `DOPPLER_TOKEN` in GitHub Secrets.

## Troubleshooting

### "Missing required environment variables" Error

**Cause**: Running in non-workstation mode without Doppler

**Solution**: Either:
1. Set `ENV=workstation` to use `.env` file
2. Provide `DOPPLER_TOKEN` and run with Doppler

### Doppler CLI Not Found

**Cause**: Doppler CLI not installed in container

**Solution**: Rebuild Docker image - Dockerfile now includes Doppler installation

### .env File Not Loading

**Cause**: `ENV` is not set to `workstation`

**Solution**: Set `ENV=workstation` explicitly

```bash
ENV=workstation npm start
```

## Security Best Practices

1. **Never commit** `.env` files to version control
2. **Rotate Doppler tokens** regularly
3. **Use separate Doppler projects** for dev/staging/production
4. **Restrict token permissions** to read-only for production deployments
5. **Monitor token usage** in Doppler dashboard

## Migration Guide

### From .env to Doppler

1. Create Doppler project and environment
2. Copy all secrets from `.env` to Doppler
3. Get service token from Doppler dashboard
4. Update deployment to use Doppler token
5. Remove `.env` from production servers

### From Doppler to .env (Rollback)

1. Export secrets from Doppler to `.env` file
2. Update Helm values: `server.doppler.enabled: false`
3. Redeploy with `--set server.doppler.enabled=false`
4. Mount or configure `.env` file in deployment
