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

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

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
  "sidebar.verify": { en: "Verify", fr: "Vérifier" },
  "sidebar.verifying": { en: "verifying…", fr: "vérification…" },
  "sidebar.settings": { en: "Settings", fr: "Paramètres" },
  "sidebar.collapse": { en: "Collapse the sidebar", fr: "Replier la barre latérale" },
  "sidebar.expand": { en: "Expand the sidebar", fr: "Déplier la barre latérale" },
  "sidebar.toLight": { en: "Switch to the light theme", fr: "Passer au thème clair" },
  "sidebar.toDark": { en: "Switch to the dark theme", fr: "Passer au thème sombre" },

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

  /* ------------------------------------------------------------ settings */
  "settings.title": { en: "Settings", fr: "Paramètres" },
  "settings.general": { en: "General", fr: "Général" },
  "settings.appearance": { en: "Appearance", fr: "Apparence" },
  "settings.language": { en: "Language", fr: "Langue" },
  "settings.repositories": { en: "Repositories", fr: "Dépôts" },
  "settings.verify": { en: "Verify", fr: "Vérification" },
  "settings.about": { en: "About", fr: "À propos" },
  "settings.close": { en: "Close settings", fr: "Fermer les paramètres" },

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

  /* --------------------------------------------------------------- cairn */
  "cairn.title": { en: "Cairn", fr: "Cairn" },
  "cairn.subtitle": {
    en: "{total} stones · {proven} proven · {broken} broken · {escalated} escalated",
    fr: "{total} stones · {proven} proven · {broken} broken · {escalated} escalated",
  },
  "cairn.all": { en: "all", fr: "toutes" },
  "cairn.everySurface": { en: "every surface", fr: "toutes surfaces" },
  "cairn.amends": { en: "AMENDS", fr: "AMENDE" },
  "cairn.empty": { en: "No stone here", fr: "Aucune stone ici" },
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
  "escalations.amend": { en: "Amend", fr: "Amender" },
  "escalations.retire": { en: "Retire", fr: "Retirer" },
  "escalations.attempts": { en: "{count} attempts spent", fr: "{count} tentatives dépensées" },
  "escalations.empty": { en: "Nothing escalated", fr: "Aucune escalade" },

  /* ---------------------------------------------------------------- runs */
  "runs.title": { en: "Runs", fr: "Exécutions" },
  "runs.follow": { en: "follow", fr: "suivre" },
  "runs.clear": { en: "clear", fr: "effacer" },
  "runs.verify": { en: "Verify", fr: "Vérifier" },
  "runs.noRun": { en: "No run yet", fr: "Aucune exécution" },
  "runs.noRunHint": {
    en: "Verify replays the proofs with Playwright. No model is involved: the proof is an artifact.",
    fr: "Verify rejoue les proofs avec Playwright. Aucun modèle n'intervient : la proof est un artefact.",
  },
  "runs.exit": { en: "exit {code}", fr: "code {code}" },
  "runs.runner": { en: "runner", fr: "exécuteur" },

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
  "drawer.noProof": { en: "No proof yet", fr: "Pas encore de proof" },

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

/** Dates and numbers follow the language, not the OS. */
export function useLocale(): string {
  const lang = useLang();
  return useMemo(() => (lang === "fr" ? "fr-FR" : "en-GB"), [lang]);
}
