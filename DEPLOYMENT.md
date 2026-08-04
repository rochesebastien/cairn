# Déploiement & releases

Deux pipelines indépendants :

1. **Site vitrine** (`website/`) → déployé sur **Vercel** (intégration Git, sans CI).
2. **Application desktop** (`apps/desktop`, Tauri 2) → publiée en **release GitHub**
   via GitHub Actions.

Le reste du monorepo (`packages/core`, `packages/cli`, `packages/mcp`) n'est pas
déployé ici : il est seulement vérifié par la CI (§4).

---

## 1. Site vitrine sur Vercel

Le site est statique et vit dans [`website/`](website/). Vercel le sert
directement ; la config (en-têtes, redirections) vit dans `website/vercel.json`.

### Mise en place (une seule fois)

1. Sur [vercel.com](https://vercel.com) → **Add New… → Project** → importez le
   repo GitHub `rochesebastien/cairn`.
2. Dans la configuration du projet :
   - **Root Directory** : `website`  ← **indispensable** (sinon Vercel déploie la
     racine du monorepo et tente de builder les packages).
   - **Framework Preset** : `Other`.
   - **Build Command** : *(vide)*.
   - **Output Directory** : *(vide / racine)*.
3. **Deploy**.

### Ensuite, c'est automatique

- Push sur `main` → déploiement **production**.
- Push sur une autre branche / PR → déploiement **preview** (URL dédiée).

Aucun secret ni workflow GitHub n'est nécessaire : Vercel écoute le repo
directement. Pour brancher un domaine perso : *Project → Settings → Domains*.

---

## 2. Release de l'application desktop

Workflow : [`.github/workflows/release.yml`](.github/workflows/release.yml).

Il compile l'app avec [`tauri-action`](https://github.com/tauri-apps/tauri-action)
sur `windows-latest` **et** `macos-latest` (`fail-fast: false` — un échec macOS
ne supprime pas les artefacts Windows), crée la release et y attache **quatre
façons** de récupérer Cairn :

| Option | Fichier dans la release | Construit par |
| --- | --- | --- |
| **Installateur Windows** | `Cairn_<version>_x64-setup.exe` (NSIS) | `tauri-action` (`--bundles nsis`) |
| **Portable Windows** (sans installateur) | `Cairn_<version>_x64_portable.exe` | copie de `apps/desktop/src-tauri/target/release/cairn-desktop.exe` |
| **macOS universel** | `Cairn_<version>_universal.dmg` | `tauri-action` (`--target universal-apple-darwin --bundles app,dmg`) |
| **Code source** | *Source code* (zip / tar.gz) | ajouté automatiquement par GitHub |

Les deux jobs publient dans la **même** release (même `tagName`).

> Linux n'est pas publié pour l'instant. L'ajouter = ajouter une entrée dans la
> matrice de `release.yml` (`ubuntu-22.04`, `--bundles deb,appimage`, plus les
> libs système Tauri en `apt-get`).

### Spécificités monorepo

Trois points que le workflow gère et qu'il ne faut pas casser :

- **pnpm, pas npm** : `pnpm/action-setup` sans input `version:` (le champ
  `packageManager` du `package.json` racine épingle la version), puis
  `pnpm install --frozen-lockfile` **à la racine**.
- **`projectPath: apps/desktop`** : l'app Tauri n'est pas à la racine.
  `tauriScript: pnpm tauri` force le passage par pnpm, la détection automatique
  du gestionnaire de paquets n'étant pas fiable depuis un sous-dossier (le
  lockfile est à la racine).
- **`@cairn/core` est construit avant le front** : `apps/desktop` importe
  `@cairn/core/schema` et `@cairn/core/stone-parse`, résolus via `dist/` qui
  n'est pas versionné. Le workflow lance donc
  `pnpm --filter @cairn/core build` avant `tauri-action` ; sans ça, le
  `beforeBuildCommand` (`pnpm build` → `tsc --noEmit && vite build`) échoue.

### Publier une version

**Voie normale — le bump de version suffit :**

1. Bumpez `version` dans
   [`apps/desktop/src-tauri/tauri.conf.json`](apps/desktop/src-tauri/tauri.conf.json)
   (ex. `0.1.0` → `0.2.0`). Gardez `apps/desktop/package.json` et
   `apps/desktop/src-tauri/Cargo.toml` alignés — c'est `tauri.conf.json` qui
   fait foi pour le workflow.
2. Poussez sur `main`.
3. Le job `check` compare `v<version>` aux releases existantes : si le tag
   n'existe pas encore, il crée le tag et publie la release. Si la version n'a
   pas bougé, le workflow s'arrête sans rien publier.

**Voie explicite — le tag :**

```sh
git tag v0.2.0
git push origin v0.2.0
```

Un tag `v*` déclenche toujours la release, sans vérification préalable.

> Lancement manuel possible : **Actions → Release → Run workflow**. Le tag est
> alors dérivé de la version de `tauri.conf.json`.

### Secrets à configurer

**Aucun.** Le workflow n'utilise que le `GITHUB_TOKEN` fourni automatiquement
par GitHub Actions (`permissions: contents: write`).

Cairn n'embarque **pas** `tauri-plugin-updater` : il n'y a donc ni `latest.json`,
ni fichiers `.sig`, ni clé de signature Tauri (`TAURI_SIGNING_PRIVATE_KEY`) à
générer. Une mise à jour se fait en retéléchargeant depuis la page *Releases*.

> ℹ️ Le mode portable est simplement l'exécutable Tauri brut. Tauri ne fournit
> pas de « vrai » mode portable officiel (les données restent stockées dans le
> dossier de données utilisateur, pas à côté de l'`.exe`).

---

## 3. Applications non signées : ce que voient les utilisateurs

### macOS — « application non vérifiée »

Le `.dmg` n'est **pas notarié** (la notarisation exige un compte Apple Developer
à 99 $/an). Au premier lancement, macOS refuse d'ouvrir l'app.

Contournement côté utilisateur, indiqué dans le corps de la release :

- clic droit sur `Cairn.app` → **Ouvrir** → **Ouvrir** ;
- ou `xattr -cr /Applications/Cairn.app`.

Pour supprimer l'avertissement pour tout le monde, il faudrait ajouter à
`release.yml` les secrets Apple attendus par `tauri-action`
(`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`). Tant qu'ils sont absents, le
build passe et l'app reste non signée : c'est volontaire, pour que la CI
fonctionne sans aucun secret.

### Windows — SmartScreen, « éditeur inconnu »

Au premier lancement, Windows affiche un écran bleu SmartScreen (« Windows a
protégé votre ordinateur »). Ce n'est **pas un bug ni un virus** : l'exécutable
n'est simplement **pas signé numériquement**, donc l'éditeur est inconnu et
l'app n'a pas encore de réputation SmartScreen. L'utilisateur peut cliquer
**Informations complémentaires → Exécuter quand même**.

Pour la distribution, il faut une signature reconnue partout :

| Option | Coût indicatif | Effet sur SmartScreen |
| --- | --- | --- |
| **Azure Trusted Signing** | ~10 $/mois | Reconnu immédiatement (recommandé indé). |
| Certificat **OV** (Authenticode) | ~100–300 $/an | Réputation acquise progressivement. |
| Certificat **EV** | ~300–500 $/an (token matériel) | Réputation immédiate. |

Tauri signe automatiquement le bundle si une de ces méthodes est configurée :

- **Azure Trusted Signing** — ajouter les inputs `tauri-action`
  (`azureTenantId`, `azureClientId`, `azureClientSecret`, endpoint et nom de
  profil de signature) alimentés par des *secrets* GitHub.
- **Certificat .pfx** — renseigner dans `bundle.windows` de
  [`tauri.conf.json`](apps/desktop/src-tauri/tauri.conf.json)
  `certificateThumbprint`, `digestAlgorithm` (`sha256`) et `timestampUrl`, et
  fournir le certificat au build via un secret.

Tant qu'aucune de ces options n'est configurée, la release reste **non signée**.

---

## 4. Vérifs continues (CI)

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) tourne sur chaque push
vers `main` / `master` / `develop` / `release/**` et sur chaque PR :

- `pnpm install --frozen-lockfile`
- `pnpm -r build` — inclut le `tsc --noEmit && vite build` de `apps/desktop`
- `pnpm -r typecheck` (après le build : `@cairn/cli` et `apps/desktop` résolvent
  `@cairn/core` par ses types publiés)
- `pnpm -r test`

Les deux workflows tournent tous les deux sur un push vers `main` — c'est
voulu et sans conflit : `ci.yml` ne se déclenche pas sur les tags (il n'a qu'un
filtre `branches`), et `release.yml` est le seul à publier.

> ⚠️ La CI ne compile **pas** le Rust de `apps/desktop/src-tauri` (pas de
> `cargo check` / `cargo clippy` / `cargo test`). Une régression côté Rust n'est
> donc découverte qu'au moment de la release. Si ça devient gênant, ajouter un
> job `cargo` à `ci.yml` — les libs système Tauri sont nécessaires sous Linux.
