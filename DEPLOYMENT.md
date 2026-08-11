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
- **`@usecairn/core` est construit avant le front** : `apps/desktop` importe
  `@usecairn/core/schema` et `@usecairn/core/stone-parse`, résolus via `dist/` qui
  n'est pas versionné. Le workflow lance donc
  `pnpm --filter @usecairn/core build` avant `tauri-action` ; sans ça, le
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
- `pnpm -r typecheck` (après le build : `@usecairn/cli` et `apps/desktop` résolvent
  `@usecairn/core` par ses types publiés)
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
`@usecairn/core` → `@usecairn/cli` → `@usecairn/mcp` — pour qu'un consommateur ne puisse
jamais résoudre `@usecairn/cli@0.1.0` avant que `@usecairn/core@0.1.0` existe.

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

### Pourquoi le scope s'appelle `@usecairn`

État du registre npm au **11 août 2026**, vérifié sur `registry.npmjs.org` :

| Nom | État | Détail |
| --- | --- | --- |
| `cairn` | ❌ **pris** | `adamterlson`, *« Simpler string-based styling for React Native »*, v0.8.0 (2022). npm réserve les noms d'organisation contre les packages non scopés : l'org `cairn` est donc **refusée**. |
| `cairn-cli` | ❌ **pris** | `driborn`, *« Automatic backup and cross-machine sync of your Claude Code config »*, v2.0.8 (mai 2026). |
| `cairn-mcp` | ❌ **pris** | `tommoman`, *« MCP server for Cairn, a shared knowledge base of AI agent observations »*, v0.2.1 (février 2026). |
| org `usecairn` | ✅ **retenue** | Libre. Convention usuelle quand le nom nu est pris, sans mentir sur le langage ni sur la portée du produit. |
| `cairnhq`, `getcairn`, `cairn-registry`, `cairnjs` | ✅ libres | Alternatives écartées. |
| `@rochesebastien/*` | ✅ libre | Repli sans création d'org, écarté : un scope personnel se lit « projet perso » et ne se cède pas proprement. |

Deux conséquences à retenir :

- **`npx cairn-mcp` n'installe pas ce projet.** Ce nom appartient à quelqu'un
  d'autre. La bonne commande est `npx @usecairn/mcp`. Seul le nom du **package**
  était pris : le *binaire* installé s'appelle toujours `cairn-mcp`, et la
  commande du CLI reste `cairn`.
- **Les replis non scopés sont fermés.** Un scope est de toute façon préférable :
  à l'intérieur de `@usecairn`, aucun nom ne peut plus être squatté.

### Mise en place (une seule fois)

1. **Créer l'organisation `usecairn`** sur
   [npmjs.com/org/create](https://www.npmjs.com/org/create), plan **Free** :
   une organisation dont les packages sont publics ne coûte rien. Activer
   ensuite *Require two-factor authentication* dans ses réglages, et la 2FA sur
   le compte propriétaire.

   ```sh
   npm login
   npm org ls usecairn                 # vous devez y apparaître comme owner
   npm access list packages @usecairn  # ce que le scope contient déjà
   ```

2. **Générer un jeton.** npmjs.com → *Access Tokens* → **Generate New Token** →
   **Granular Access Token** :
   - *Expiration* : 90 jours ou plus (à renouveler — le workflow cassera à
     l'expiration) ;
   - *Packages and scopes* : **Read and write**, puis **« Select scopes »**
     et cocher `@usecairn`. Ne pas choisir « Select packages » : la liste est
     vide tant que rien n'est publié, et le mode « scopes » couvre aussi les
     packages à venir ;
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
   `@usecairn/cli@0.2.0` dépendra automatiquement de `@usecairn/core@0.2.0`).
2. Commiter, pousser sur `main`, attendre la CI verte.
3. Taguer et pousser :

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

4. Le workflow publie les trois packages. Vérifier ensuite :

   ```sh
   npm view @usecairn/core version
   npx --yes @usecairn/cli --help
   ```

> ⚠️ Le tag est partagé avec la release desktop (§2), qui lit sa version dans
> `apps/desktop/src-tauri/tauri.conf.json`. Gardez les deux versions alignées,
> sinon le tag `v0.1.0` publiera des packages `0.1.0` et une app dont le numéro
> diffère.

### À savoir

- Chaque package a son `README.md` (repris sur sa page npm).
- Le `LICENSE` de la racine est repris automatiquement par pnpm dans les trois
  tarballs — rien à faire.
- Les tarballs embarquent les `*.js.map`, mais **pas** les sources `src/`
  qu'ils référencent : les source maps sont donc inertes chez le consommateur.
  Pour les rendre utiles, ajouter `"src"` au champ `files` ; pour gagner en
  poids, désactiver `sourceMap` dans `tsconfig.base.json`.
- `@usecairn/cli` publie aussi `templates/` (les modèles de CI de §4 de
  [docs/ci.md](docs/ci.md)), accessibles après installation dans
  `node_modules/@usecairn/cli/templates/ci/`.

### Sécurité de la chaîne de publication

Ce que le dépôt applique déjà est récapitulé dans [SECURITY.md](SECURITY.md)
(quarantaine de 7 jours sur les versions fraîches, scripts d'installation des
dépendances bloqués, actions épinglées par SHA, `persist-credentials: false`,
audit bloquant en CI, cooldown Dependabot). Restent les réglages qui vivent
côté npm et GitHub — à faire une fois, à la main :

**Côté npm**

1. **2FA obligatoire** sur le compte, et sur l'org `@usecairn` une fois créée :
   Org → Settings → « Require two-factor authentication ».
2. **Token granulaire minimal** : type *Granular access token*, *Read and
   write* limité au scope `@usecairn`, **automation** (pas d'OTP au publish,
   sinon le workflow bloque), avec expiration (90 jours) — à renouveler, pas
   à élargir. Jamais de token « classic », jamais de token dans un fichier.
3. **Migrer vers le trusted publishing (OIDC) dès la première publication
   faite** : sur npmjs.com, chaque package → Settings → *Trusted publisher* →
   GitHub Actions, dépôt `rochesebastien/cairn`, workflow `npm-publish.yml`.
   Ensuite, supprimer le secret `NPM_TOKEN` : plus aucun token à voler, c'est
   la défense de fond contre les vers de type Shai-Hulud, qui se propagent
   précisément en volant des tokens de publication. (Le workflow devra alors
   ajouter `permissions: id-token: write` et laisser npm ≥ 11.5 négocier
   l'OIDC.)
4. **Provenance** : l'attestation (`--provenance`) exige un dépôt source
   public. Le dépôt étant privé aujourd'hui, elle est documentée mais pas
   activée — l'activer le jour où le dépôt s'ouvre.

**Côté GitHub** (Settings du dépôt)

1. **Code security** : activer *Secret scanning* **et** *Push protection*
   (un token npm ou autre secret poussé par erreur est bloqué avant d'entrer
   dans l'historique).
2. **Branch protection sur `main`** : exiger les checks `build · typecheck ·
   test`, `pnpm audit (prod, high)`, `cairn verify (proven-only)` et
   `cairn verify --integrity --no-run` ; interdire le force-push. Sans cela,
   le ratchet et l'audit sont décoratifs.
3. **Actions → General** : « Allow actions created by GitHub » + la liste des
   actions épinglées, et *Workflow permissions* sur « Read repository
   contents » par défaut.
4. **Environnements** (optionnel mais recommandé) : placer `NPM_TOKEN` dans un
   *environment* `npm` avec reviewers requis, et cibler cet environnement
   depuis `npm-publish.yml` — un tag ne publie alors qu'après un clic humain.
