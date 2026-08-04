/**
 * Two languages, one dictionary, no dependency.
 *
 * The rule that matters: **the vocabulary does not translate**. A cairn is a
 * cairn, a stone is a stone, a proof is a proof, and the mason and the warden
 * keep their names — in French as in English. Those five words are the product;
 * translating them would leave two vocabularies to keep in sync and a French
 * reader unable to follow the CLI, the skills or the docs, which stay English.
 * Statuses (draft, proven, broken, escalated, retired) are values written into
 * `.cairn/` files, so they are shown verbatim too.
 *
 * Everything else — labels, hints, prose — is translated.
 */

import { createContext, Fragment, useCallback, useContext, useMemo, type ReactNode } from "react";

export type Lang = "en" | "fr";

export const LANGS: { id: Lang; label: string; hint: string }[] = [
  { id: "en", label: "English", hint: "the default" },
  { id: "fr", label: "Français", hint: "Cairn, stone, proof, warden and mason stay as they are" },
];

type Entry = { en: string; fr: string };

/** Flat, dotted keys. Placeholders look like {count}. */
export const DICT: Record<string, Entry> = {
  /* ------------------------------------------------------------- sidebar */
  "nav.review": { en: "Review", fr: "Relecture" },
  "nav.cairn": { en: "Cairn", fr: "Cairn" },
  "nav.escalations": { en: "Escalations", fr: "Escalades" },
  "nav.runs": { en: "Runs", fr: "Exécutions" },
  "nav.search": { en: "Search", fr: "Recherche" },
  "nav.home": { en: "Home", fr: "Accueil" },
  "sidebar.repositories": { en: "Repositories", fr: "Dépôts" },
  "sidebar.openRepo": { en: "open repo…", fr: "ouvrir un dépôt…" },
  // `verify` and `amend` are the CLI's own verbs: the button runs `cairn verify`.
  // Translating them would break the link a French reader needs to the command line.
  "sidebar.verify": { en: "Verify", fr: "Verify" },
  "sidebar.verifying": { en: "verifying…", fr: "verify en cours…" },
  "sidebar.settings": { en: "Settings", fr: "Paramètres" },
  "sidebar.collapse": { en: "Collapse the sidebar", fr: "Replier la barre latérale" },
  "sidebar.expand": { en: "Expand the sidebar", fr: "Déplier la barre latérale" },
  "sidebar.toLight": { en: "Switch to the light theme", fr: "Passer au thème clair" },
  "sidebar.toDark": { en: "Switch to the dark theme", fr: "Passer au thème sombre" },
  "sidebar.views": { en: "Views", fr: "Vues" },

  /* ---------------------------------------------------------------- home */
  "home.title": { en: "Proofs replayed", fr: "Proofs rejouées" },
  "home.reading": { en: "reading the cairns…", fr: "lecture des cairns…" },
  "home.captionAll": {
    en: "{count} in {year} · {repos} repositories",
    fr: "{count} en {year} · {repos} dépôts",
  },
  "home.captionOne": { en: "{count} in {year} · {repo}", fr: "{count} en {year} · {repo}" },
  "home.project": { en: "Project", fr: "Projet" },
  "home.allProjects": { en: "All projects", fr: "Tous les projets" },
  "home.year": { en: "Year", fr: "Année" },
  "home.activeDays": { en: "{count} days with a run", fr: "{count} jours avec une exécution" },
  "home.streak": { en: "longest streak {count} days", fr: "plus longue série {count} jours" },
  "home.passRate": { en: "{percent} of runs passed", fr: "{percent} des exécutions au vert" },
  "home.noRun": { en: "no run yet", fr: "aucune exécution" },
  "home.less": { en: "less", fr: "moins" },
  "home.more": { en: "more", fr: "plus" },
  "home.creeping": { en: "failures creeping in", fr: "des échecs s'installent" },
  "home.badDay": { en: "a bad day", fr: "une mauvaise journée" },
  "heat.noProof": { en: "No proof replayed", fr: "Aucune proof rejouée" },
  "heat.one": { en: "proof replayed", fr: "proof rejouée" },
  "heat.many": { en: "proofs replayed", fr: "proofs rejouées" },
  "heat.passed": { en: "passed", fr: "au vert" },
  "heat.failed": { en: "failed", fr: "au rouge" },
  "heat.skipped": { en: "skipped", fr: "ignorées" },
  "home.heatLabel": { en: "Proof runs in {year}", fr: "Exécutions de proofs en {year}" },
  "home.cellEmpty": { en: "{day}: no proof replayed", fr: "{day} : aucune proof rejouée" },
  "home.cellRuns": {
    en: "{day}: {count} proofs, {percent} passed",
    fr: "{day} : {count} proofs, {percent} au vert",
  },

  /* -------------------------------------------------------------- search */
  "search.placeholder": {
    en: "Search stones, criteria, ULIDs, views…",
    fr: "Chercher des stones, des critères, des ULIDs, des vues…",
  },
  "search.goTo": { en: "Go to", fr: "Aller à" },
  "search.stones": { en: "Stones", fr: "Stones" },
  "search.empty": { en: "Nothing matches “{query}”.", fr: "Rien ne correspond à « {query} »." },
  "search.move": { en: "move", fr: "naviguer" },
  "search.open": { en: "open", fr: "ouvrir" },
  "search.close": { en: "close", fr: "fermer" },
  "search.count": { en: "{count} stones", fr: "{count} stones" },
  "search.countOne": { en: "{count} stone", fr: "{count} stone" },
  "search.repository": { en: "repository", fr: "dépôt" },
  "search.hint.home": { en: "the heatmap", fr: "la heatmap" },
  "search.hint.review": { en: "drafts waiting to be read", fr: "les drafts à relire" },
  "search.hint.cairn": { en: "every stone", fr: "toutes les stones" },
  "search.hint.escalations": { en: "out of attempts", fr: "à bout de tentatives" },
  "search.hint.runs": { en: "verify output", fr: "la sortie de verify" },
  "search.dialogLabel": { en: "Search the cairn", fr: "Chercher dans le cairn" },

  /* ------------------------------------------------------------ settings */
  "settings.title": { en: "Settings", fr: "Paramètres" },
  "settings.general": { en: "General", fr: "Général" },
  "settings.appearance": { en: "Appearance", fr: "Apparence" },
  "settings.language": { en: "Language", fr: "Langue" },
  "settings.repositories": { en: "Repositories", fr: "Dépôts" },
  "settings.verify": { en: "Verify", fr: "Verify" },
  "settings.about": { en: "About", fr: "À propos" },
  "settings.close": { en: "Close settings", fr: "Fermer les paramètres" },
  "settings.sections": { en: "Settings sections", fr: "Sections des paramètres" },

  "settings.reduceMotion": { en: "Reduce motion", fr: "Réduire les animations" },
  "settings.reduceMotionHint": {
    en: "Drop the shell and drawer animations. The OS preference already does this; here you can ask for it anyway.",
    fr: "Supprime les animations de la coque et du panneau. La préférence système le fait déjà ; ici vous pouvez l'exiger malgré tout.",
  },
  "settings.collapsedSidebar": { en: "Collapsed sidebar", fr: "Barre latérale repliée" },
  "settings.collapsedSidebarHint": {
    en: "Start on the icon rail. You can always toggle it from the sidebar head.",
    fr: "Démarrer sur le rail d'icônes. Le bouton en tête de barre latérale la déplie à tout moment.",
  },
  "settings.searchRow": { en: "Search", fr: "Recherche" },
  "settings.searchRowHint": { en: "Open the palette from anywhere.", fr: "Ouvrir la palette depuis n'importe où." },

  "settings.theme": { en: "Theme", fr: "Thème" },
  "settings.themeHint": {
    en: "Dark is the default. The choice persists under cairn.theme.",
    fr: "Le sombre est le défaut. Le choix est conservé sous cairn.theme.",
  },
  "settings.light": { en: "Light", fr: "Clair" },
  "settings.dark": { en: "Dark", fr: "Sombre" },
  "settings.statusColour": { en: "Status colour", fr: "Couleur de statut" },
  "settings.statusColourHint": {
    en: "The only hues in the app. They mark a stone's verdict at glyph scale and never fill a surface.",
    fr: "Les seules teintes de l'application. Elles portent le verdict d'une stone à l'échelle du glyphe et ne remplissent jamais une surface.",
  },

  "settings.languageRow": { en: "Interface language", fr: "Langue de l'interface" },
  "settings.languageHint": {
    en: "Cairn, stone, proof, warden and mason are the product's vocabulary and stay in English in every language, as do the statuses written into .cairn/ files.",
    fr: "Cairn, stone, proof, warden et mason forment le vocabulaire du produit : ils restent en anglais dans toutes les langues, comme les statuts écrits dans les fichiers .cairn/.",
  },

  "settings.reposNote": {
    en: "Cairn has no database — a repository is the state. Opening one only remembers its path.",
    fr: "Cairn n'a pas de base de données — le dépôt est l'état. En ouvrir un ne mémorise que son chemin.",
  },
  "settings.stonesCount": { en: "{count} stones", fr: "{count} stones" },
  "settings.readingRepo": { en: "reading…", fr: "lecture…" },
  "settings.openRepository": { en: "Open repository…", fr: "Ouvrir un dépôt…" },

  "settings.verifyNote": {
    en: "These come from cairn.config.ts in the open repository. They are read here, never written: the config is the project's, not the app's.",
    fr: "Ces valeurs viennent de cairn.config.ts dans le dépôt ouvert. Elles sont lues ici, jamais écrites : la configuration appartient au projet, pas à l'application.",
  },
  "settings.baseURL": { en: "Base URL", fr: "URL de base" },
  "settings.baseURLHint": { en: "Where the proofs drive the app.", fr: "L'adresse que les proofs pilotent." },
  "settings.startCommand": { en: "Start command", fr: "Commande de lancement" },
  "settings.startCommandHint": {
    en: "How the app under test is launched.",
    fr: "Comment l'application testée est démarrée.",
  },
  "settings.setupHook": { en: "Setup hook", fr: "Hook de préparation" },
  "settings.setupHookHint": {
    en: "Seed run before a verify, so a proof starts from a known state.",
    fr: "Amorçage joué avant un verify, pour qu'une proof parte d'un état connu.",
  },
  "settings.retries": { en: "Retries", fr: "Ré-essais" },
  "settings.retriesHint": {
    en: "Playwright retries per proof. Two is the ceiling the CI policy allows.",
    fr: "Ré-essais Playwright par proof. Deux est le plafond autorisé par la politique CI.",
  },
  "settings.none": { en: "none", fr: "aucun" },

  "settings.readingFrom": { en: "Reading from", fr: "Source de lecture" },
  "settings.readingFromHint": {
    en: "The demo cairn runs in a plain browser; the desktop build reads real folders.",
    fr: "Le cairn de démonstration tourne dans un simple navigateur ; la version desktop lit de vrais dossiers.",
  },
  "settings.proofFormat": { en: "Proof format", fr: "Format de proof" },
  "settings.proofFormatHint": {
    en: "v1 drives a web app in a browser. A CLI or a native app has nothing to prove it with yet.",
    fr: "La v1 pilote une application web dans un navigateur. Une CLI ou une application native n'a encore rien pour se prouver.",
  },
  "settings.aboutNote": {
    en: "A stone carries the user's own words and one deterministic proof that the promise is still kept. CI replays that proof with no model in the loop.",
    fr: "Une stone porte les mots de l'utilisateur et une proof déterministe que la promesse tient toujours. La CI rejoue cette proof sans aucun modèle dans la boucle.",
  },

  /* -------------------------------------------------------------- review */
  "review.title": { en: "Review", fr: "Relecture" },
  "review.subtitle": { en: "{done} of {total} drafts still to read", fr: "{done} draft(s) sur {total} à relire" },
  "review.approve": { en: "Approve", fr: "Approuver" },
  "review.rephrase": { en: "Rephrase", fr: "Reformuler" },
  "review.reject": { en: "Reject", fr: "Rejeter" },
  "review.open": { en: "open", fr: "ouvrir" },
  "review.provenance": { en: "what was actually asked", fr: "ce qui a été demandé" },
  "review.raised": { en: "raised {when}", fr: "levée {when}" },
  "review.kbdMove": { en: "move", fr: "naviguer" },
  "review.kbdApprove": { en: "approve", fr: "approuver" },
  "review.kbdOpen": { en: "open the stone", fr: "ouvrir la stone" },
  "review.kbdClose": { en: "close", fr: "fermer" },
  "review.empty": { en: "No draft to read", fr: "Aucun draft à relire" },
  "review.emptyHint": {
    en: "cairn-mason writes drafts into .cairn/stones as it extracts intents. They appear here.",
    fr: "cairn-mason écrit les drafts dans .cairn/stones à mesure qu'il extrait les intentions. Ils apparaissent ici.",
  },
  "review.subtitleEmpty": {
    en: "nothing waiting — the mason has raised no new stones",
    fr: "rien en attente — le mason n'a levé aucune nouvelle stone",
  },
  "review.sessionNote": {
    en: "{count} decisions recorded in this session only. Writing them back to the cairn needs the MCP wiring ({createDraft} / {amendStone}) — the stones below are still drafts on disk.",
    fr: "{count} décisions enregistrées pour cette session seulement. Les réécrire dans le cairn demande le câblage MCP ({createDraft} / {amendStone}) — les stones ci-dessous restent des drafts sur le disque.",
  },
  "review.noAcceptance": { en: "No acceptance criteria yet.", fr: "Pas encore de critères d'acceptation." },
  "review.decisionApproved": { en: "approved", fr: "approuvée" },
  "review.decisionRephrase": { en: "sent back for rephrasing", fr: "renvoyée pour reformulation" },
  "review.decisionRejected": { en: "rejected", fr: "rejetée" },
  "review.decisionNote": { en: "{decision} — in this session", fr: "{decision} — sur cette session" },
  "review.undo": { en: "undo", fr: "annuler" },

  /* --------------------------------------------------------------- cairn */
  "cairn.title": { en: "Cairn", fr: "Cairn" },
  "cairn.subtitle": {
    en: "{total} stones · {proven} proven · {broken} broken · {escalated} escalated",
    fr: "{total} stones · {proven} proven · {broken} broken · {escalated} escalated",
  },
  "cairn.all": { en: "all", fr: "toutes" },
  "cairn.everySurface": { en: "every surface", fr: "toutes surfaces" },
  // `amend` is vocabulary: it names the operation written into .cairn/, so it
  // does not become "amende" (which reads as a fine) in French.
  "cairn.amends": { en: "AMENDS", fr: "AMENDS" },
  "cairn.empty": { en: "No stone here", fr: "Aucune stone ici" },
  "cairn.emptyAll": { en: "The cairn is empty", fr: "Le cairn est vide" },
  "cairn.emptyAllHint": {
    en: "Stones appear as cairn-mason extracts intents into .cairn/stones.",
    fr: "Les stones apparaissent à mesure que cairn-mason extrait les intentions dans .cairn/stones.",
  },
  "cairn.green": { en: "green {when}", fr: "vert {when}" },

  /* ---------------------------------------------------------- escalations */
  "escalations.title": { en: "Escalations", fr: "Escalades" },
  "escalations.subtitle": { en: "{count} stones out of attempts", fr: "{count} stones à bout de tentatives" },
  "escalations.wardenReport": { en: "WARDEN REPORT", fr: "RAPPORT DU WARDEN" },
  "escalations.verdict": { en: "VERDICT", fr: "VERDICT" },
  "escalations.expected": { en: "EXPECTED", fr: "ATTENDU" },
  "escalations.actual": { en: "ACTUAL", fr: "CONSTATÉ" },
  "escalations.failedAt": { en: "FAILED AT", fr: "ÉCHEC À" },
  "escalations.trace": { en: "TRACE", fr: "TRACE" },
  "escalations.when": { en: "WHEN", fr: "QUAND" },
  "escalations.sendBack": { en: "Send back to coder", fr: "Renvoyer au coder" },
  "escalations.amend": { en: "Amend", fr: "Amend" },
  "escalations.retire": { en: "Retire", fr: "Retirer" },
  "escalations.attempts": { en: "{count} attempts spent", fr: "{count} tentatives dépensées" },
  "escalations.empty": { en: "Nothing escalated", fr: "Aucune escalade" },
  "escalations.emptyHint": {
    en: "A stone lands here when the coder/warden loop burns its three attempts. Its only exits are amend and retire.",
    fr: "Une stone arrive ici quand la boucle coder/warden a brûlé ses trois tentatives. Ses seules sorties sont amend et retire.",
  },
  "escalations.subtitleEmpty": {
    en: "no stone is waiting on a human",
    fr: "aucune stone n'attend un humain",
  },
  "escalations.noReport": {
    en: "No report was written for this stone. Phase 1 records the attempt count in provenance and nothing else — open the stone to read its last failure from the run log.",
    fr: "Aucun rapport n'a été écrit pour cette stone. La phase 1 note le nombre de tentatives dans la provenance et rien d'autre — ouvrez la stone pour lire son dernier échec dans le journal d'exécution.",
  },
  "escalations.notWired": {
    en: "“{action}” is not wired yet. It will call {call}.",
    fr: "« {action} » n'est pas encore câblé. Cela appellera {call}.",
  },
  "escalations.wiringSendBack": {
    en: "record_run + a fresh coder attempt (the budget resets to 3)",
    fr: "record_run + une nouvelle tentative du coder (le budget repart à 3)",
  },
  "escalations.wiringAmend": {
    en: "amend_stone — the old stone retires, the new one starts as a draft",
    fr: "amend_stone — l'ancienne stone passe retired, la nouvelle démarre en draft",
  },
  "escalations.wiringRetire": {
    en: "retire_stone — the stone leaves the suite and stops being verified",
    fr: "retire_stone — la stone quitte la suite et n'est plus vérifiée",
  },

  /* ---------------------------------------------------------------- runs */
  "runs.title": { en: "Runs", fr: "Exécutions" },
  "runs.follow": { en: "follow", fr: "suivre" },
  "runs.clear": { en: "clear", fr: "effacer" },
  "runs.verify": { en: "Verify", fr: "Verify" },
  "runs.noRun": { en: "No run yet", fr: "Aucune exécution" },
  "runs.noRunHint": {
    en: "Verify replays the proofs with Playwright. No model is involved: the proof is an artifact.",
    fr: "Verify rejoue les proofs avec Playwright. Aucun modèle n'intervient : la proof est un artefact.",
  },
  "runs.exit": { en: "exit {code}", fr: "code {code}" },
  "runs.runner": { en: "runner", fr: "exécuteur" },
  "runs.starting": { en: "starting the runner…", fr: "démarrage de l'exécuteur…" },
  "runs.noBaseURL": { en: "no baseURL in config", fr: "pas de baseURL dans la config" },

  /* -------------------------------------------------------------- drawer */
  "drawer.intent": { en: "INTENT", fr: "INTENTION" },
  "drawer.acceptance": { en: "ACCEPTANCE", fr: "CRITÈRES" },
  "drawer.provenance": { en: "PROVENANCE", fr: "PROVENANCE" },
  "drawer.proof": { en: "PROOF", fr: "PROOF" },
  "drawer.runs": { en: "RUNS", fr: "EXÉCUTIONS" },
  "drawer.failure": { en: "LAST FAILURE", fr: "DERNIER ÉCHEC" },
  "drawer.lineage": { en: "LINEAGE", fr: "LIGNAGE" },
  "drawer.close": { en: "Close", fr: "Fermer" },
  "drawer.raisedGreen": { en: "raised {raised} · last green {green}", fr: "levée {raised} · dernier vert {green}" },
  "drawer.raised": { en: "raised {raised}", fr: "levée {raised}" },
  "drawer.attemptsTokens": { en: "{attempts} attempt(s) · {tokens} tokens", fr: "{attempts} tentative(s) · {tokens} tokens" },
  "drawer.attempts": { en: "{attempts} attempt(s)", fr: "{attempts} tentative(s)" },
  "drawer.noAttempts": { en: "attempts not recorded", fr: "tentatives non enregistrées" },
  "drawer.noProof": { en: "No proof yet", fr: "Pas encore de proof" },
  "drawer.noProofHint": {
    en: "cairn-warden writes it once the stone is approved.",
    fr: "cairn-warden l'écrit une fois la stone approuvée.",
  },
  "drawer.closeStone": { en: "Close the stone", fr: "Fermer la stone" },
  "drawer.neverGreen": { en: "never green", fr: "jamais au vert" },
  "drawer.noAcceptance": { en: "No criteria on this stone.", fr: "Aucun critère sur cette stone." },
  "drawer.neverHashed": { en: "never hashed", fr: "jamais hachée" },
  "drawer.reading": { en: "reading…", fr: "lecture…" },
  "drawer.cannotReadProof": {
    en: "Cannot read the proof: {message}",
    fr: "Lecture de la proof impossible : {message}",
  },
  "drawer.noRuns": { en: "No run recorded for this stone.", fr: "Aucune exécution enregistrée pour cette stone." },
  "drawer.pass": { en: "pass", fr: "réussie" },
  "drawer.fail": { en: "fail", fr: "échouée" },
  "drawer.fromLastGreen": { en: "from lastGreen", fr: "d'après lastGreen" },
  "drawer.shotAlt": { en: "Playwright screenshot of the failure", fr: "Capture Playwright de l'échec" },
  "drawer.openTrace": { en: "open trace", fr: "ouvrir la trace" },
  "drawer.openTraceTitle": {
    en: "open the trace with the system handler",
    fr: "ouvrir la trace avec l'application système",
  },
  "drawer.desktopOnly": { en: "available in the desktop build", fr: "disponible dans la version desktop" },
  "drawer.redNoReport": {
    en: "Red on {when} — no warden report was stored. The run log holds the Playwright output.",
    fr: "Rouge le {when} — aucun rapport du warden n'a été conservé. Le journal d'exécution garde la sortie Playwright.",
  },

  /* --------------------------------------------------------------- shell */
  "shell.openRepoTitle": { en: "Open a repository", fr: "Ouvrir un dépôt" },
  "shell.openRepoHint": {
    en: "Cairn has no database — the repository is the state. Pick a folder that owns a .cairn/ directory.",
    fr: "Cairn n'a pas de base de données — le dépôt est l'état. Choisissez un dossier qui possède un répertoire .cairn/.",
  },
  "shell.openRepo": { en: "Open repo…", fr: "Ouvrir un dépôt…" },
  "shell.reading": { en: "Reading the cairn", fr: "Lecture du cairn" },
  "shell.readingBody": { en: "Reading .cairn/…", fr: "Lecture de .cairn/…" },
  "shell.cannotRead": { en: "Cannot read the cairn", fr: "Lecture du cairn impossible" },
  "shell.cannotReadHint": {
    en: "Check that this folder owns a .cairn/ directory, then try again.",
    fr: "Vérifiez que ce dossier possède bien un répertoire .cairn/, puis réessayez.",
  },
  "shell.noRepo": { en: "no repository open", fr: "aucun dépôt ouvert" },
};

export type TranslateFn = (key: keyof typeof DICT | string, vars?: Record<string, string | number>) => string;

const LangContext = createContext<Lang>("en");

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }): JSX.Element {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

/**
 * `t("home.streak", { count: 12 })`.
 *
 * A missing key returns the key itself: loud in development, harmless in
 * production, and never an empty label.
 */
export function useT(): TranslateFn {
  const lang = useLang();
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const entry = DICT[key];
      let text = entry ? entry[lang] : key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replaceAll(`{${name}}`, String(value));
        }
      }
      return text;
    },
    [lang],
  );
}

const PLACEHOLDER = /(\{[A-Za-z]\w*\})/g;

export type TranslateNodeFn = (key: keyof typeof DICT | string, vars: Record<string, ReactNode>) => ReactNode;

/**
 * Same dictionary, but a placeholder may be a node.
 *
 * `tn("home.activeDays", { count: <strong>{n}</strong> })` — the sentence keeps
 * its markup without being cut into fragments that no translator could reorder.
 */
export function useTNode(): TranslateNodeFn {
  const lang = useLang();
  return useCallback(
    (key: string, vars: Record<string, ReactNode>) => {
      const entry = DICT[key];
      const text = entry ? entry[lang] : key;
      return text.split(PLACEHOLDER).map((part, index) => {
        const name = part.startsWith("{") && part.endsWith("}") ? part.slice(1, -1) : null;
        if (name === null || !(name in vars)) return part;
        return <Fragment key={`${name}-${index}`}>{vars[name]}</Fragment>;
      });
    },
    [lang],
  );
}

/** Dates and numbers follow the language, not the OS. */
export function useLocale(): string {
  const lang = useLang();
  return useMemo(() => (lang === "fr" ? "fr-FR" : "en-GB"), [lang]);
}
