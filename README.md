# TaskFlow — Cloud-Native DevOps Portfolio Project

TaskFlow is a small REST API designed to make the **platform** the interesting part. The application is a Node.js/Express task manager backed by PostgreSQL and Redis. The repository demonstrates containerisation, CI security gates, GitOps, Kubernetes, Sealed Secrets, observability hooks, and repeatable infrastructure.

## Architecture

```mermaid
flowchart LR
    Dev[Developer] --> Git[GitHub]
    Git --> CI[GitHub Actions]
    CI --> Scan[Tests + Trivy + Gitleaks]
    Scan --> GHCR[GHCR Image]
    CI --> Promote[Update Helm image tag]
    Promote --> Argo[Argo CD Root App]
    Argo --> K8s[Kubernetes / k3d]
    K8s --> API[TaskFlow API x2]
    API --> PG[(PostgreSQL)]
    API --> Redis[(Redis)]
    API --> Metrics[/metrics]
```

## Repository layout

```text
app-of-apps/                 Argo CD child Application
src/                         Node.js API
migrations/                  SQL schema/migrations
deploy/chart/                Helm chart for API + PostgreSQL + Redis
scripts/seal-secret.sh       Generates an encrypted SealedSecret from cluster cert
.github/workflows/           CI, image security, signing and GitOps promotion
docs/LEARNING-GUIDE.md       Detailed project learning documentation
```

## First deployment

### 1. Put this repository at the URL used by the Argo root app

The repository is designed for:

`https://github.com/FET0/taskflow-app`

Your existing Terraform root Application should use that URL and the path `app-of-apps`.

### 2. Create the encrypted application secret

The current Kubernetes cluster already has Sealed Secrets installed. From a machine where `kubectl` and `kubeseal` point at that cluster:

```bash
export POSTGRES_USER=taskflow
export POSTGRES_PASSWORD='replace-with-a-long-random-password'
export POSTGRES_DB=taskflow
export REDIS_PASSWORD='replace-with-another-long-random-password'
./scripts/seal-secret.sh
```

The script writes an encrypted manifest to `deploy/chart/templates/taskflow-sealed-secret.yaml`. The plaintext values are never written to Git.

Review the generated manifest, then commit and push it.

### 3. Let GitHub Actions build and promote the image

On `main`, the workflow:

1. runs tests and linting;
2. scans the repository with Trivy and Gitleaks;
3. builds and pushes `ghcr.io/fet0/taskflow-api:<commit-sha>`;
4. scans the container image;
5. signs it with Cosign keyless signing;
6. updates `deploy/chart/values.yaml` to the immutable commit SHA.

Argo CD sees the Git change and syncs the new image tag.

### 4. Verify GitOps

```bash
kubectl get applications -n argocd
kubectl get pods -n taskflow
kubectl get svc -n taskflow
kubectl logs -n taskflow deploy/taskflow
```

For a local test through port-forward:

```bash
kubectl -n taskflow port-forward svc/taskflow 8080:80
```

Then:

```bash
curl http://127.0.0.1:8080/healthz
curl http://127.0.0.1:8080/readyz
curl http://127.0.0.1:8080/api/v1/tasks
curl http://127.0.0.1:8080/metrics
```

Create a task:

```bash
curl -X POST http://127.0.0.1:8080/api/v1/tasks \
  -H 'content-type: application/json' \
  -d '{"title":"Learn Argo CD","description":"Understand GitOps reconciliation"}'
```

## Important GHCR note

For a cluster to pull the image without a registry credential, make the GHCR package public. For a private package, add an `imagePullSecret` and update the Helm chart accordingly. Do not put a GitHub token in Git.

## Development

```bash
cp .env.example .env
npm install
npm test
npm run lint
```

For the full learning path, read `docs/LEARNING-GUIDE.md`.
