# CCXT Bot Helm Chart

A Helm chart for deploying the CCXT Trading Bot to Kubernetes.

## Architecture

This chart deploys:
- **MongoDB**: Database for storing user accounts and trading data
- **CCXT Bot Server**: Node.js trading bot application
- **Ingress** (optional): HTTPS access via NGINX ingress controller with Let's Encrypt

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- NGINX Ingress Controller (if using ingress)
- cert-manager (if using TLS)

## Installation

### Development Environment

```bash
# Install in development mode
helm upgrade --install ccxt-bot ./helm \
  -f ./helm/values-dev.yaml \
  --namespace trading --create-namespace

# Watch deployment status
kubectl get pods -n trading -w
```

### Production Environment

```bash
# Install in production mode with custom values
helm upgrade --install ccxt-bot ./helm \
  -f ./helm/values-prod.yaml \
  --namespace trading --create-namespace \
  --set mongodb.rootPassword="YOUR_SECURE_PASSWORD" \
  --set server.image.tag="v1.0.0" \
  --set ingress.host="ccxt-bot.yourdomain.com"
```

## Configuration

### Key Configuration Options

| Parameter | Description | Default |
|-----------|-------------|---------|
| `mongodb.rootPassword` | MongoDB root password | `CHANGE_ME_IN_PRODUCTION` |
| `mongodb.storage.dataSize` | MongoDB data volume size | `20Gi` (prod), `5Gi` (dev) |
| `server.replicaCount` | Number of server replicas | `3` (prod), `1` (dev) |
| `server.image.repository` | Server Docker image repository | `ccxt-bot-server` |
| `server.image.tag` | Server Docker image tag | `latest` |
| `ingress.enabled` | Enable ingress | `true` |
| `ingress.host` | Ingress hostname | `ccxt-bot.example.com` |
| `ingress.tls.enabled` | Enable TLS/HTTPS | `true` |

### Environment-Specific Files

- `values-dev.yaml`: Development environment (1 replica, smaller storage)
- `values-prod.yaml`: Production environment (3 replicas, HA setup)

## Upgrading

```bash
# Upgrade with new image tag
helm upgrade ccxt-bot ./helm \
  -f ./helm/values-prod.yaml \
  --set server.image.tag="v1.1.0" \
  --namespace trading
```

## Uninstalling

```bash
# Uninstall the release
helm uninstall ccxt-bot --namespace trading

# Delete PVCs (WARNING: This deletes all data!)
kubectl delete pvc -n trading -l app.kubernetes.io/name=ccxt-bot
```

## Building and Pushing Docker Image

Before deploying, you need to build and push the server Docker image:

```bash
# Build the image
cd server
docker build -t your-registry/ccxt-bot-server:v1.0.0 .

# Push to registry
docker push your-registry/ccxt-bot-server:v1.0.0

# Update Helm values to use your image
helm upgrade --install ccxt-bot ./helm \
  -f ./helm/values-prod.yaml \
  --set server.image.repository="your-registry/ccxt-bot-server" \
  --set server.image.tag="v1.0.0" \
  --namespace trading
```

## Accessing the Application

### Via Ingress (with DNS)

1. Configure DNS to point to your ingress controller's external IP:
   ```bash
   kubectl get ingress -n trading
   ```

2. Access via HTTPS: `https://your-domain.com`

### Via Port Forward (for testing)

```bash
# Forward server port
kubectl port-forward -n trading svc/ccxt-bot-server 3000:80

# Access at http://localhost:3000
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n trading
kubectl describe pod <pod-name> -n trading
kubectl logs <pod-name> -n trading
```

### Check MongoDB Connection

```bash
# Connect to MongoDB pod
kubectl exec -it -n trading <mongodb-pod-name> -- mongosh

# Inside mongosh:
use ccxt-bot
db.auth("root", "YOUR_PASSWORD")
show collections
```

### Check Server Logs

```bash
kubectl logs -n trading deployment/ccxt-bot-server -f
```

## Security Notes

1. **Change default passwords**: Always override `mongodb.rootPassword` in production
2. **Use secrets management**: Consider using tools like Sealed Secrets or External Secrets Operator
3. **Image security**: Scan Docker images for vulnerabilities before deployment
4. **Network policies**: Consider implementing Kubernetes Network Policies for pod-to-pod communication

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
- name: Deploy to Kubernetes
  run: |
    helm upgrade --install ccxt-bot ./helm \
      -f ./helm/values-${{ github.ref_name }}.yaml \
      --namespace trading --create-namespace \
      --set mongodb.rootPassword="${{ secrets.MONGO_PASSWORD }}" \
      --set server.image.repository="${{ env.DOCKER_IMAGE }}" \
      --set server.image.tag="${{ env.DOCKER_TAG }}"
```
