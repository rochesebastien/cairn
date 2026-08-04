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
import { CloseIcon, FolderIcon, MoonIcon, PlusIcon, SettingsIcon, SunIcon } from "./icons.js";

type Section = "general" | "appearance" | "repositories" | "verify" | "about";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "repositories", label: "Repositories" },
  { id: "verify", label: "Verify" },
  { id: "about", label: "About" },
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
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Settings">
        <nav className="dialog-rail" aria-label="Settings sections">
          <div className="dialog-rail-head">
            <SettingsIcon className="nav-icon" />
            <span>Settings</span>
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
              {entry.label}
            </button>
          ))}
        </nav>

        <div className="dialog-main">
          <header className="dialog-head">
            <h2 className="dialog-title">{SECTIONS.find((s) => s.id === section)?.label}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close settings">
              <CloseIcon />
            </button>
          </header>

          <div className="dialog-body">
            {section === "general" ? (
              <>
                <Row
                  label="Reduce motion"
                  hint="Drop the shell and drawer animations. The OS preference already does this; here you can ask for it anyway."
                >
                  <Switch
                    on={settings.reduceMotion}
                    onChange={(value) => {
                      onSet("reduceMotion", value);
                    }}
                    label="Reduce motion"
                  />
                </Row>
                <Row label="Collapsed sidebar" hint="Start on the icon rail. You can always toggle it from the sidebar head.">
                  <Switch
                    on={settings.sidebarCollapsed}
                    onChange={(value) => {
                      onSet("sidebarCollapsed", value);
                    }}
                    label="Collapsed sidebar"
                  />
                </Row>
                <Row label="Search" hint="Open the palette from anywhere.">
                  <span className="row-value">
                    <kbd className="kbd">⌘</kbd>
                    <kbd className="kbd">K</kbd>
                  </span>
                </Row>
              </>
            ) : null}

            {section === "appearance" ? (
              <>
                <Row label="Theme" hint="Dark is the default. The choice persists under cairn.theme.">
                  <div className="segmented">
                    <button
                      type="button"
                      className={theme === "light" ? "active" : ""}
                      onClick={() => {
                        if (theme !== "light") onToggleTheme();
                      }}
                    >
                      <SunIcon className="nav-icon" />
                      Light
                    </button>
                    <button
                      type="button"
                      className={theme === "dark" ? "active" : ""}
                      onClick={() => {
                        if (theme !== "dark") onToggleTheme();
                      }}
                    >
                      <MoonIcon className="nav-icon" />
                      Dark
                    </button>
                  </div>
                </Row>
                <Row
                  label="Status colour"
                  hint="The only hues in the app. They mark a stone's verdict at glyph scale and never fill a surface."
                >
                  <span className="row-value swatches">
                    <span className="swatch" style={{ background: "var(--status-proven)" }} /> proven
                    <span className="swatch" style={{ background: "var(--status-broken)" }} /> broken
                    <span className="swatch" style={{ background: "var(--status-escalated)" }} /> escalated
                  </span>
                </Row>
              </>
            ) : null}

            {section === "repositories" ? (
              <>
                <p className="dialog-note">
                  Cairn has no database — a repository is the state. Opening one only remembers its path.
                </p>
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
                          {snapshot ? `${snapshot.stones.length} stones` : "reading…"}
                        </span>
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
                  Open repository…
                </button>
              </>
            ) : null}

            {section === "verify" ? (
              <>
                <p className="dialog-note">
                  These come from <code>cairn.config.ts</code> in the open repository. They are read here, never
                  written: the config is the project's, not the app's.
                </p>
                <Row label="Base URL" hint="Where the proofs drive the app.">
                  <span className="row-value mono">{config?.baseURL ?? "—"}</span>
                </Row>
                <Row label="Start command" hint="How the app under test is launched.">
                  <span className="row-value mono">{config?.start ?? "—"}</span>
                </Row>
                <Row label="Setup hook" hint="Seed run before a verify, so a proof starts from a known state.">
                  <span className="row-value mono">{config?.setup ?? "none"}</span>
                </Row>
                <Row label="Retries" hint="Playwright retries per proof. Two is the ceiling the CI policy allows.">
                  <span className="row-value mono">{config?.retries ?? 0}</span>
                </Row>
              </>
            ) : null}

            {section === "about" ? (
              <>
                <Row label="Reading from" hint="The demo cairn runs in a plain browser; the desktop build reads real folders.">
                  <span className="row-value">
                    {sourceLabel} <span className="muted">({sourceKind})</span>
                  </span>
                </Row>
                <Row label="Proof format" hint="v1 drives a web app in a browser. A CLI or a native app has nothing to prove it with yet.">
                  <span className="row-value">Playwright</span>
                </Row>
                <p className="dialog-note">
                  A stone carries the user's own words and one deterministic proof that the promise is still kept. CI
                  replays that proof with no model in the loop.
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
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
