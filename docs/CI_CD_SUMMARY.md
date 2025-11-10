# CI/CD Summary

## GitHub Actions Workflow

A production-ready GitHub Actions workflow has been created at [.github/workflows/deploy.yaml](../.github/workflows/deploy.yaml).

### What It Does

1. **Builds** Docker image for the server only (not the client)
2. **Pushes** to GitHub Container Registry (ghcr.io)
3. **Deploys** to Kubernetes using Helm
4. **Verifies** deployment succeeded

### Trigger

Automatically runs on push to:
- `dev` branch → deploys to development environment
- `prod` branch → deploys to production environment

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions Workflow                   │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼────────┐
                    │  Push to dev/prod │
                    └─────────┬────────┘
                              │
            ┌─────────────────▼──────────────────┐
            │      Job: build-push-server        │
            │  1. Checkout code                  │
            │  2. Login to ghcr.io               │
            │  3. Build server/Dockerfile        │
            │  4. Push with SHA & latest tags    │
            └─────────────────┬──────────────────┘
                              │
                ┌─────────────▼─────────────┐
                │      Job: deploy           │
                │  1. Validate secrets       │
                │  2. Setup kubeconfig       │
                │  3. Verify k8s connection  │
                │  4. Deploy with Helm       │
                │  5. Wait for rollout       │
                │  6. Display status         │
                └────────────────────────────┘
```

## Required GitHub Secrets

Configure these in: **Settings → Secrets and variables → Actions**

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `GHCR_TOKEN` | GitHub Container Registry token | GitHub Settings → Developer settings → Personal access tokens |
| `dev_KUBECONFIG` | Development k8s config (base64) | `cat ~/.kube/config \| base64 -w 0` |
| `prod_KUBECONFIG` | Production k8s config (base64) | `cat ~/.kube/config \| base64 -w 0` |
| `dev_DOPPLER_TOKEN` | Development Doppler token | Doppler Dashboard → Service Tokens |
| `prod_DOPPLER_TOKEN` | Production Doppler token | Doppler Dashboard → Service Tokens |

## Configuration Updates Needed

Update these values in [.github/workflows/deploy.yaml](../.github/workflows/deploy.yaml):

```yaml
env:
  DOCKER_ORG: berryhill        # ← Change to YOUR GitHub username
  GITHUB_USER: berryhill       # ← Change to YOUR GitHub username
```

## Docker Images

Images are pushed to GitHub Container Registry:

```
ghcr.io/berryhill/ccxt-bot-server:abc123def  # Git commit SHA
ghcr.io/berryhill/ccxt-bot-server:latest     # Latest build
```

## Deployment Process

### Development Deployment

```bash
# Make changes
git add .
git commit -m "Update server"
git push origin dev

# Workflow automatically:
# 1. Builds ghcr.io/berryhill/ccxt-bot-server:<commit-sha>
# 2. Deploys to k8s with helm/values-dev.yaml
# 3. Uses dev_KUBECONFIG and dev_DOPPLER_TOKEN
```

### Production Deployment

```bash
# Merge dev to prod
git checkout prod
git merge dev
git push origin prod

# Workflow automatically:
# 1. Builds ghcr.io/berryhill/ccxt-bot-server:<commit-sha>
# 2. Deploys to k8s with helm/values-prod.yaml
# 3. Uses prod_KUBECONFIG and prod_DOPPLER_TOKEN
```

## Helm Deployment Command

The workflow runs this Helm command:

```bash
helm upgrade --install ccxt-bot ./helm \
  -f ./helm/values-${BRANCH}.yaml \
  --namespace trading --create-namespace \
  --set server.doppler.token="${DOPPLER_TOKEN}" \
  --set server.image.repository="ghcr.io/berryhill/ccxt-bot-server" \
  --set server.image.tag="${GIT_SHA}" \
  --set server.environment="${BRANCH}" \
  --wait
```

## First-Time Setup Checklist

- [ ] Update `DOCKER_ORG` and `GITHUB_USER` in workflow file
- [ ] Create `GHCR_TOKEN` secret
- [ ] Create `dev_KUBECONFIG` secret (base64-encoded)
- [ ] Create `prod_KUBECONFIG` secret (base64-encoded)
- [ ] Create `dev_DOPPLER_TOKEN` secret
- [ ] Create `prod_DOPPLER_TOKEN` secret
- [ ] Create `dev` branch: `git checkout -b dev && git push origin dev`
- [ ] Create `prod` branch: `git checkout -b prod && git push origin prod`
- [ ] Update [helm/values-dev.yaml](../helm/values-dev.yaml) with dev hostname
- [ ] Update [helm/values-prod.yaml](../helm/values-prod.yaml) with prod hostname
- [ ] Test by pushing to `dev` branch

## Monitoring Deployment

### View Workflow Run

1. Go to GitHub repository
2. Click "Actions" tab
3. Click on the latest workflow run
4. View logs for each job

### Check Kubernetes Deployment

```bash
# Set kubeconfig
export KUBECONFIG=~/.kube/config

# Check pods
kubectl get pods -n trading

# Check deployment
kubectl get deployment ccxt-bot-server -n trading

# Check ingress
kubectl get ingress -n trading

# View logs
kubectl logs -n trading deployment/ccxt-bot-server -f

# Check events
kubectl get events -n trading --sort-by='.lastTimestamp'
```

## Rollback

If a deployment fails, rollback to previous version:

```bash
# List revisions
helm history ccxt-bot -n trading

# Rollback to previous
helm rollback ccxt-bot -n trading

# Or rollback to specific revision
helm rollback ccxt-bot 3 -n trading
```

## Workflow Outputs

The workflow displays:

```
📊 Deployment Status:
NAME                              READY   STATUS    RESTARTS   AGE
pod/ccxt-bot-server-xxx-yyy       1/1     Running   0          2m
pod/ccxt-bot-mongodb-xxx-yyy      1/1     Running   0          5m

🌐 Ingress URLs:
NAME                HOSTS
ccxt-bot-ingress    dev.ccxt-bot.example.com

📦 Image deployed:
ghcr.io/berryhill/ccxt-bot-server:abc123def456
```

## Security Notes

- Secrets are never exposed in workflow logs
- Kubeconfig is base64-encoded for safe storage
- Docker images are private by default in GHCR
- Each environment uses separate credentials
- Deployment uses namespace isolation (`trading`)

## Differences from Draftfly

The ccxt-bot workflow is simpler because it only deploys the server:

| Feature | Draftfly | CCXT Bot |
|---------|----------|----------|
| Components | 2 (agent + app) | 1 (server only) |
| Build jobs | 2 parallel | 1 single |
| Helm charts | 2 separate | 1 unified |
| Client build | Yes | No (not deployed) |

## Next Steps

1. **Complete setup** - Follow the checklist above
2. **Test dev deployment** - Push to dev branch
3. **Verify monitoring** - Check logs and metrics
4. **Test prod deployment** - Push to prod branch
5. **Set up alerts** - Configure alerts for failed deployments
6. **Document runbooks** - Create incident response procedures

## Troubleshooting

See [GITHUB_ACTIONS_SETUP.md](GITHUB_ACTIONS_SETUP.md) for detailed troubleshooting guide.

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Helm Documentation](https://helm.sh/docs/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [Doppler Documentation](https://docs.doppler.com/)
