# Security policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's advisory form:
**[Security → Report a vulnerability](https://github.com/rochesebastien/cairn/security/advisories/new)**.
Do not open a public issue for a security problem. You will get an answer
within a week; a fix ships before the report is made public.

Only the latest `0.x` release line is supported.

## Supply-chain posture

What this repository does to keep a compromised dependency, action or token
from reaching users — and where each measure lives:

| Threat | Measure | Where |
| --- | --- | --- |
| Poisoned fresh release of a dependency (worm-style npm attacks) | 7-day install quarantine: versions younger than a week resolve to older ones | `minimumReleaseAge`, `pnpm-workspace.yaml` |
| Malicious `postinstall` script in a dependency | Lifecycle scripts of dependencies are blocked by pnpm; only `esbuild` is allow-listed | `pnpm.onlyBuiltDependencies`, root `package.json` |
| Dependency drift in CI | Installs are lockfile-exact, never resolving | `--frozen-lockfile` in every workflow |
| Known vulnerable dependency shipping to consumers | Blocking audit of production dependencies | `audit` job, `.github/workflows/ci.yml` |
| Hijacked GitHub Action tag (tj-actions-style) | Every third-party action is pinned to a full commit SHA, with the version as a comment | all `.github/workflows/*.yml` and the CI templates |
| Workflow step exfiltrating the repo token | `persist-credentials: false` on every checkout; workflow permissions are minimal (`contents: read` unless releasing) | all workflows |
| Dependabot proposing a poisoned version | Same 7-day cooldown as the install quarantine | `.github/dependabot.yml` |
| Stolen npm token publishing a malicious version | No token in any developer environment: publishing happens only in the tag-triggered workflow, from a repository secret; the release ritual and the trusted-publishing migration are documented | `.github/workflows/npm-publish.yml`, `DEPLOYMENT.md` |
| Tampered proof of a proven stone | sha256 integrity audit on every push | `cairn verify --integrity`, `.github/workflows/cairn.yml` |

Settings that live on GitHub/npm rather than in the repository — 2FA, secret
scanning, push protection, branch protection, npm trusted publishing — are
listed with their setup steps in [DEPLOYMENT.md](DEPLOYMENT.md).
