# Déploiement & releases

Trois pipelines indépendants :

1. **Site vitrine** (`website/`) → déployé sur **Vercel** (intégration Git, sans CI).
2. **Application desktop** (`apps/desktop`, Tauri 2) → publiée en **release GitHub**
   via GitHub Actions.
3. **Packages** (`packages/core`, `packages/cli`, `packages/mcp`) → publiés sur
   **npm** via GitHub Actions (§5).

Tout est vérifié en continu par la CI (§4).

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

`ci.yml` et `release.yml` tournent tous les deux sur un push vers `main` —
c'est voulu et sans conflit : `ci.yml` ne se déclenche pas sur les tags (il n'a
qu'un filtre `branches`), donc il ne publie jamais rien. Sur un tag `v*`, ce
sont `release.yml` (l'app desktop, §2) et `npm-publish.yml` (les packages, §5)
qui prennent le relais, chacun sur sa cible.

> ⚠️ La CI ne compile **pas** le Rust de `apps/desktop/src-tauri` (pas de
> `cargo check` / `cargo clippy` / `cargo test`). Une régression côté Rust n'est
> donc découverte qu'au moment de la release. Si ça devient gênant, ajouter un
> job `cargo` à `ci.yml` — les libs système Tauri sont nécessaires sous Linux.

---

## 5. Publier sur npm

Workflow : [`.github/workflows/npm-publish.yml`](.github/workflows/npm-publish.yml).

Il publie les **trois packages** dans l'ordre des dépendances —
`@cairn/core` → `@cairn/cli` → `@cairn/mcp` — pour qu'un consommateur ne puisse
jamais résoudre `@cairn/cli@0.1.0` avant que `@cairn/core@0.1.0` existe.

Déclencheurs :

- **Tag `v*`** poussé (ex. `v0.1.0`) — la voie normale.
- **Lancement manuel** (*Actions → Publish to npm → Run workflow*), avec une
  case `dry_run` qui valide et empaquette **sans rien publier**.

Le workflow rejoue d'abord la CI (`build`, `typecheck`, `test`), vérifie le
contenu des tarballs, puis publie. **Les re-runs sont sans danger** : une version
déjà présente sur le registre est ignorée, pas republiée (npm interdit de toute
façon d'écraser une version publiée).

> Un tag `v*` déclenche **aussi** `release.yml` (l'app desktop). C'est voulu :
> un seul tag livre l'app et les packages. Les deux workflows n'écrivent jamais
> au même endroit.

### ⚠️ Avant tout : le scope `@cairn` n'est pas encore acquis

État du registre npm au **10 août 2026** (vérifié sur `registry.npmjs.org`) :

| Nom | État | Détail |
| --- | --- | --- |
| `@cairn/core`, `@cairn/cli`, `@cairn/mcp` | **404** | Aucun package publié sous ce scope. |
| scope `@cairn` | **indéterminé** | Aucun package public (`?text=scope:cairn` → 0 résultat), mais npm n'expose pas publiquement la propriété d'un scope. **À confirmer connecté** (voir ci-dessous). |
| `cairn` | ❌ **pris** | `adamterlson` — *« Simpler string-based styling for React Native »*, v0.8.0 (2022). |
| `cairn-cli` | ❌ **pris** | `driborn` — *« Automatic backup and cross-machine sync of your Claude Code config »*, v2.0.8 (mai 2026). |
| `cairn-mcp` | ❌ **pris** | `tommoman` — *« MCP server for Cairn — a shared knowledge base of AI agent observations »*, v0.2.1 (février 2026). |
| `cairn-stones`, `cairn-registry`, `cairnjs`, `cairn-proofs` | ✅ libres | Replis possibles en non-scopé. |
| `@rochesebastien/*` | ✅ libre | Repli recommandé (scope personnel). |

Conséquences :

- **`npx cairn-mcp` n'installe pas ce projet** : ce nom appartient à quelqu'un
  d'autre. Tant que `@cairn/mcp` n'est pas publié, la bonne commande est
  `npx @cairn/mcp`. (Le *binaire* peut rester nommé `cairn-mcp` — c'est le nom
  du **package** qui est pris, pas celui de la commande.)
- Les replis non scopés `cairn` et `cairn-cli` sont **fermés**. Le seul repli
  propre est un scope : `@rochesebastien/core`, `@rochesebastien/cli`,
  `@rochesebastien/mcp`.

**Rien n'a été renommé dans le code** : c'est une décision de propriétaire. Les
`package.json` restent sur `@cairn/*`.

### Mise en place (une seule fois)

1. **Vérifier / obtenir le scope `@cairn`.** Connecté (`npm login`), depuis
   n'importe quel dossier :

   ```sh
   npm org ls cairn          # existe et vous en êtes membre ? → OK
   npm access list packages @cairn   # ce que le scope contient déjà
   ```

   Si le scope est libre, le créer sur
   [npmjs.com/org/create](https://www.npmjs.com/org/create) (une organisation
   avec des packages publics est **gratuite**). Un scope personnel `@<votre
   pseudo npm>` est réservé automatiquement à l'inscription — d'où le repli
   `@rochesebastien/*`, qui ne demande aucune création.

   > Si le scope `@cairn` est déjà pris par quelqu'un d'autre, le
   > `npm publish` échouera en `403 Forbidden`. Il faut alors basculer les trois
   > `name` (et les `dependencies` internes) vers le scope de repli, puis
   > mettre ce tableau à jour.

2. **Générer un jeton.** npmjs.com → *Access Tokens* → **Generate New Token** →
   **Granular Access Token** :
   - *Expiration* : 90 jours ou plus (à renouveler — le workflow cassera à
     l'expiration) ;
   - *Packages and scopes* : **Read and write**, limité au scope `@cairn`
     (ou aux trois packages une fois publiés) ;
   - pas de permission « Organizations » nécessaire.

   > Un **classic token** de type *Automation* fait aussi l'affaire ; le
   > granular est préférable (portée réduite, expiration explicite).
   > Le jeton doit être de type automation / CI : un jeton exigeant la 2FA
   > à chaque publication bloquerait le workflow.

3. **Ajouter le secret GitHub.** Repo → *Settings → Secrets and variables →
   Actions → New repository secret* :
   - **Name** : `NPM_TOKEN` (exactement — c'est le nom lu par le workflow) ;
   - **Secret** : le jeton généré.

4. **Répétition générale.** *Actions → Publish to npm → Run workflow* en
   cochant **`dry_run`**. Le job doit être vert et lister le contenu des trois
   tarballs sans rien publier.

### Publier une version

1. Bumper le `version` des trois `package.json` de `packages/*` **en une seule
   fois et à la même valeur** (les dépendances internes sont en
   `workspace:*` : pnpm les réécrit en version exacte au moment du `pack`, donc
   `@cairn/cli@0.2.0` dépendra automatiquement de `@cairn/core@0.2.0`).
2. Commiter, pousser sur `main`, attendre la CI verte.
3. Taguer et pousser :

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

4. Le workflow publie les trois packages. Vérifier ensuite :

   ```sh
   npm view @cairn/core version
   npx --yes @cairn/cli --help
   ```

> ⚠️ Le tag est partagé avec la release desktop (§2), qui lit sa version dans
> `apps/desktop/src-tauri/tauri.conf.json`. Gardez les deux versions alignées,
> sinon le tag `v0.1.0` publiera des packages `0.1.0` et une app dont le numéro
> diffère.

### À savoir

- **`packages/core` et `packages/cli` n'ont pas de `README.md`** : leur page npm
  sera vide. Seul `packages/mcp` en a un. Ajouter un README par package (même
  court, avec un lien vers le dépôt) avant la première publication.
- Le `LICENSE` de la racine est repris automatiquement par pnpm dans les trois
  tarballs — rien à faire.
- Les tarballs embarquent les `*.js.map`, mais **pas** les sources `src/`
  qu'ils référencent : les source maps sont donc inertes chez le consommateur.
  Pour les rendre utiles, ajouter `"src"` au champ `files` ; pour gagner en
  poids, désactiver `sourceMap` dans `tsconfig.base.json`.
- `@cairn/cli` publie aussi `templates/` (les modèles de CI de §4 de
  [docs/ci.md](docs/ci.md)), accessibles après installation dans
  `node_modules/@cairn/cli/templates/ci/`.
