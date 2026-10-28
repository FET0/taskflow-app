# GitHub Setup Checklist

1. Create/use the repository:

   `https://github.com/FET0/taskflow-app`

2. Push this repository to `main`.

3. In GitHub, open **Actions → General** and make sure workflows are permitted to run.

4. The image workflow needs package write permission. It requests `packages: write` automatically through `GITHUB_TOKEN`.

5. For passwordless image pulling from Kubernetes, configure the GHCR package as public. For a private package, create an image pull secret through a secure secret-management process and add it to the Helm chart.

6. The first successful `main` build creates:

   `ghcr.io/fet0/taskflow-api:<commit-sha>`

   and a temporary convenience tag:

   `ghcr.io/fet0/taskflow-api:main`

7. The workflow then commits the immutable SHA into `deploy/chart/values.yaml`. Because the workflow skips runs whose actor is `github-actions[bot]`, its own promotion commit does not create an infinite build loop.

8. The repository should contain no plaintext secret values. Run `scripts/seal-secret.sh` against the target cluster and commit only its encrypted output.
