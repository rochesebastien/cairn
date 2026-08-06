/**
 * Settings — a wide dialog with its own left rail, the shape ChatGPT uses.
 *
 * Only two kinds of row live here: preferences that genuinely persist on this
 * machine, and read-only facts about where the app is reading from. Anything
 * that belongs to a cairn belongs in `.cairn/`, not in a settings pane.
 */

import { useEffect, useState } from "react";
import { useAllCairns, useAppState } from "../lib/app-state.js";
import { repoName } from "../lib/cairn.js";
import type { Settings } from "../lib/settings.js";
import type { Theme } from "../lib/theme.js";
import { LANGS, useT } from "../lib/i18n.js";
import { CloseIcon, FolderIcon, MoonIcon, PlusIcon, SettingsIcon, SunIcon } from "./icons.js";

type Section = "general" | "appearance" | "language" | "repositories" | "verify" | "about";

const SECTIONS: { id: Section; labelKey: string }[] = [
  { id: "general", labelKey: "settings.general" },
  { id: "appearance", labelKey: "settings.appearance" },
  { id: "language", labelKey: "settings.language" },
  { id: "repositories", labelKey: "settings.repositories" },
  { id: "verify", labelKey: "settings.verify" },
  { id: "about", labelKey: "settings.about" },
];

export function SettingsDialog({
  onClose,
  theme,
  onToggleTheme,
  settings,
  onSet,
}: {
  onClose: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  settings: Settings;
  onSet: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}): JSX.Element {
  const t = useT();
  const [section, setSection] = useState<Section>("general");
  const { repos, activeRoot, selectRepo, openRepo, sourceKind, sourceLabel } = useAppState();
  const results = useAllCairns(repos);
  const activeIndex = repos.indexOf(activeRoot ?? "");
  const config = activeIndex >= 0 ? (results[activeIndex]?.data?.config ?? null) : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label={t("settings.title")}>
        <nav className="dialog-rail" aria-label={t("settings.sections")}>
          <div className="dialog-rail-head">
            <SettingsIcon className="nav-icon" />
            <span>{t("settings.title")}</span>
          </div>
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`dialog-rail-item ${section === entry.id ? "active" : ""}`}
              onClick={() => {
                setSection(entry.id);
              }}
              aria-current={section === entry.id ? "page" : undefined}
            >
              {t(entry.labelKey)}
            </button>
          ))}
        </nav>

        <div className="dialog-main">
          <header className="dialog-head">
            <h2 className="dialog-title">{t(SECTIONS.find((s) => s.id === section)?.labelKey ?? "settings.title")}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t("settings.close")}>
              <CloseIcon />
            </button>
          </header>

          <div className="dialog-body">
            {section === "general" ? (
              <>
                <Row label={t("settings.reduceMotion")} hint={t("settings.reduceMotionHint")}>
                  <Switch
                    on={settings.reduceMotion}
                    onChange={(value) => {
                      onSet("reduceMotion", value);
                    }}
                    label={t("settings.reduceMotion")}
                  />
                </Row>
                <Row label={t("settings.collapsedSidebar")} hint={t("settings.collapsedSidebarHint")}>
                  <Switch
                    on={settings.sidebarCollapsed}
                    onChange={(value) => {
                      onSet("sidebarCollapsed", value);
                    }}
                    label={t("settings.collapsedSidebar")}
                  />
                </Row>
                <Row label={t("settings.searchRow")} hint={t("settings.searchRowHint")}>
                  <span className="row-value">
                    <kbd className="kbd">⌘</kbd>
                    <kbd className="kbd">K</kbd>
                  </span>
                </Row>
              </>
            ) : null}

            {section === "appearance" ? (
              <>
                <Row label={t("settings.theme")} hint={t("settings.themeHint")}>
                  <div className="segmented">
                    <button
                      type="button"
                      className={theme === "light" ? "active" : ""}
                      onClick={() => {
                        if (theme !== "light") onToggleTheme();
                      }}
                    >
                      <SunIcon className="nav-icon" />
                      {t("settings.light")}
                    </button>
                    <button
                      type="button"
                      className={theme === "dark" ? "active" : ""}
                      onClick={() => {
                        if (theme !== "dark") onToggleTheme();
                      }}
                    >
                      <MoonIcon className="nav-icon" />
                      {t("settings.dark")}
                    </button>
                  </div>
                </Row>
                <Row label={t("settings.statusColour")} hint={t("settings.statusColourHint")}>
                  {/* the three statuses are values in .cairn/ — never translated */}
                  <span className="row-value swatches">
                    <span className="swatch" style={{ background: "var(--status-proven)" }} /> proven
                    <span className="swatch" style={{ background: "var(--status-broken)" }} /> broken
                    <span className="swatch" style={{ background: "var(--status-escalated)" }} /> escalated
                  </span>
                </Row>
              </>
            ) : null}

            {section === "language" ? (
              <Row label={t("settings.languageRow")} hint={t("settings.languageHint")}>
                <div className="segmented">
                  {LANGS.map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      className={settings.language === lang.id ? "active" : ""}
                      onClick={() => {
                        onSet("language", lang.id);
                      }}
                      aria-pressed={settings.language === lang.id}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </Row>
            ) : null}

            {section === "repositories" ? (
              <>
                <p className="dialog-note">{t("settings.reposNote")}</p>
                <div className="repo-table">
                  {repos.map((root, i) => {
                    const snapshot = results[i]?.data;
                    return (
                      <button
                        key={root}
                        type="button"
                        className={`repo-row ${root === activeRoot ? "active" : ""}`}
                        onClick={() => {
                          selectRepo(root);
                        }}
                      >
                        <FolderIcon className="nav-icon" />
                        <span className="repo-row-name">{repoName(root)}</span>
                        <span className="repo-row-count">
                          {snapshot
                            ? t("settings.stonesCount", { count: snapshot.stones.length })
                            : t("settings.readingRepo")}
                        </span>
                        {/* a filesystem path: verbatim, in mono */}
                        <span className="repo-row-path mono">{root}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    void openRepo();
                  }}
                >
                  <PlusIcon className="nav-icon" />
                  {t("settings.openRepository")}
                </button>
              </>
            ) : null}

            {section === "verify" ? (
              <>
                {/* the file name stays a file name in every language, and keeps the mono voice */}
                <p className="dialog-note">{codeAround(t("settings.verifyNote"), "cairn.config.ts")}</p>
                <Row label={t("settings.baseURL")} hint={t("settings.baseURLHint")}>
                  <span className="row-value mono">{config?.baseURL ?? "—"}</span>
                </Row>
                <Row label={t("settings.startCommand")} hint={t("settings.startCommandHint")}>
                  <span className="row-value mono">{config?.start ?? "—"}</span>
                </Row>
                <Row label={t("settings.setupHook")} hint={t("settings.setupHookHint")}>
                  <span className="row-value mono">{config?.setup ?? t("settings.none")}</span>
                </Row>
                <Row label={t("settings.retries")} hint={t("settings.retriesHint")}>
                  <span className="row-value mono">{config?.retries ?? 0}</span>
                </Row>
              </>
            ) : null}

            {section === "about" ? (
              <>
                <Row label={t("settings.readingFrom")} hint={t("settings.readingFromHint")}>
                  <span className="row-value">
                    {sourceLabel} <span className="muted">({sourceKind})</span>
                  </span>
                </Row>
                <Row label={t("settings.proofFormat")} hint={t("settings.proofFormatHint")}>
                  {/* the tool's name, not a word */}
                  <span className="row-value">Playwright</span>
                </Row>
                <p className="dialog-note">{t("settings.aboutNote")}</p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Wraps every occurrence of a file name in the sentence with the mono voice. */
function codeAround(text: string, token: string): React.ReactNode[] {
  return text.split(token).flatMap((part, index) => (index === 0 ? [part] : [<code key={index}>{token}</code>, part]));
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        <div className="setting-hint">{hint}</div>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (value: boolean) => void;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch ${on ? "on" : ""}`}
      onClick={() => {
        onChange(!on);
      }}
    >
      <span className="switch-knob" />
    </button>
  );
}
