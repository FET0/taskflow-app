# OpenTofu Root Application Update

Your existing OpenTofu resource must point Argo CD at the actual Git repository:

```hcl
resource "kubectl_manifest" "argocd_root_app" {
  yaml_body = <<-YAML
    apiVersion: argoproj.io/v1alpha1
    kind: Application
    metadata:
      name: root-app
      namespace: argocd
    spec:
      project: default
      source:
        repoURL: https://github.com/FET0/taskflow-app.git
        targetRevision: main
        path: app-of-apps
      destination:
        server: https://kubernetes.default.svc
        namespace: argocd
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
  YAML
}
```

Use the exact structure already present in your infrastructure repository; the critical correction is the `repoURL` and `path`.

After editing the infrastructure repo:

```bash
tofu fmt
tofu validate
tofu plan -out=taskflow.tfplan
tofu apply taskflow.tfplan
```

Do not reuse an old saved plan after changing `main.tf`.
