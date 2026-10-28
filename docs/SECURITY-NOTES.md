# Security Notes

- Never commit plaintext database or Redis credentials.
- `scripts/seal-secret.sh` creates encrypted SealedSecret data for the current cluster.
- GHCR authentication uses GitHub's ephemeral `GITHUB_TOKEN`; do not replace it with a long-lived token in the workflow.
- The deployment runs the API as a non-root user with dropped Linux capabilities.
- Trivy and Gitleaks are blocking CI checks for HIGH/CRITICAL findings and secrets.
- Cosign provides an image-signing step; a future deployment policy should verify the signature before admission.
- For private GHCR packages, use a Kubernetes imagePullSecret sourced from a secure secret-management workflow.
