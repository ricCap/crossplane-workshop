# gitops/

Everything ArgoCD reconciles lives here. The root app-of-apps
(`bootstrap/root-app.yaml`) points at this directory and picks up
`projects/*.yaml` and `apps/*.yaml`; each child Application then
reconciles its own subdirectory.

| Subfolder | Purpose |
|---|---|
| `apps/` | ArgoCD Applications and ApplicationSets — the app-of-apps children. |
| `cert-manager/` | Let's Encrypt `ClusterIssuer` for TLS certificates. |
| `crossplane-config/` | `DeveloperEnvironment` XRD, Composition, and ProviderConfigs. |
| `crossplane-packages/` | Crossplane Providers, Functions, and their RBAC. |
| `docs/` | Workshop docs site Deployment, Service, RBAC, and HTTPRoute. |
| `envoy-gateway/` | Gateway API `GatewayClass`, `Gateway`, and traffic policies. |
| `participant-xrs/` | One `DeveloperEnvironment` XR per participant pair — the scale lever. (Crossplane v2, no claim layer.) |
| `projects/` | ArgoCD `AppProject` definitions. |
| `vcluster-platform/` | vCluster Platform `Project` config and HTTPRoute. |

To add a new participant pair, drop a file into `participant-xrs/`
following the shape of `fancy-lemon.yaml`. ArgoCD and Crossplane do
the rest.
