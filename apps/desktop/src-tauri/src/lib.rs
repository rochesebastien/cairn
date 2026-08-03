//! Native side of the Cairn desktop app.
//!
//! Four commands and one watcher, nothing more:
//!
//! * `pick_repo`   — the folder picker (the repository *is* the state).
//! * `read_cairn`  — read `.cairn/` in one pass; stone files come back as raw
//!                   text and are parsed on the TypeScript side with
//!                   @cairn/core, so there is exactly one parser in the repo.
//! * `read_proof`  — read one proof file, read-only, scoped to `.cairn/`.
//! * `run_verify`  — spawn the `cairn` CLI and stream its output as events.
//! * `watch_cairn` — a debounced `notify` watcher emitting `cairn-changed`.
//!
//! No LLM is involved anywhere in here: verify replays an artifact.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

const CAIRN_DIR: &str = ".cairn";
const CONFIG_BASENAMES: [&str; 6] = [
    "cairn.config.ts",
    "cairn.config.mts",
    "cairn.config.cts",
    "cairn.config.js",
    "cairn.config.mjs",
    "cairn.config.cjs",
];
/// Changes inside `.cairn/` arrive in bursts (the warden writes a stone and a
/// proof together). Collapse a burst into one refresh.
const WATCH_DEBOUNCE: Duration = Duration::from_millis(250);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileEntry {
    /// POSIX path, relative to the project root.
    path: String,
    content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CairnFiles {
    root: String,
    config_path: Option<String>,
    config_source: Option<String>,
    stones: Vec<FileEntry>,
    proofs: Vec<String>,
    unreadable: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VerifyLine {
    run_id: String,
    line: String,
    stream: &'static str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VerifyEnd {
    run_id: String,
    code: i32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CairnChanged {
    root: String,
}

/// Live watchers, keyed by project root. Dropping the watcher stops it.
#[derive(Default)]
pub struct Watchers(Mutex<HashMap<String, RecommendedWatcher>>);

/* ------------------------------------------------------------------ paths */

fn to_posix(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Walk up from `start` looking for the directory that owns a cairn, the same
/// way the CLI does. Falls back to `start`.
fn find_project_root(start: &Path) -> PathBuf {
    let mut current = start.to_path_buf();
    loop {
        if current.join(CAIRN_DIR).is_dir() {
            return current;
        }
        for name in CONFIG_BASENAMES {
            if current.join(name).is_file() {
                return current;
            }
        }
        match current.parent() {
            Some(parent) => current = parent.to_path_buf(),
            None => return start.to_path_buf(),
        }
    }
}

/// Refuse anything that escapes `<root>/.cairn` — the app never reads outside
/// the registry, whatever a stone's `proof` field claims.
fn resolve_inside_cairn(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let cairn_dir = root.join(CAIRN_DIR);
    let candidate = root.join(relative.replace('\\', "/"));
    let canonical = candidate
        .canonicalize()
        .map_err(|error| format!("cannot resolve {relative}: {error}"))?;
    let cairn_canonical = cairn_dir
        .canonicalize()
        .map_err(|error| format!("cannot resolve {CAIRN_DIR}: {error}"))?;
    if !canonical.starts_with(&cairn_canonical) {
        return Err(format!("{relative} is outside {CAIRN_DIR}"));
    }
    Ok(canonical)
}

/* --------------------------------------------------------------- commands */

#[tauri::command]
async fn pick_repo(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = channel();
    app.dialog()
        .file()
        .set_title("Open a repository")
        .pick_folder(move |picked| {
            let _ = tx.send(picked);
        });

    let picked = tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten())
        .await
        .map_err(|error| error.to_string())?;

    Ok(picked.map(|path| path.to_string()))
}

#[tauri::command]
fn read_cairn(
    root: String,
    stones_dir: Option<String>,
    proofs_dir: Option<String>,
) -> Result<CairnFiles, String> {
    let start = PathBuf::from(&root);
    let project_root = find_project_root(&start);
    let cairn_dir = project_root.join(CAIRN_DIR);
    if !cairn_dir.is_dir() {
        return Err(format!(
            "no {CAIRN_DIR}/ in {} — run `cairn init` there first",
            project_root.display()
        ));
    }

    let stones_path =
        project_root.join(stones_dir.unwrap_or_else(|| format!("{CAIRN_DIR}/stones")));
    let proofs_path =
        project_root.join(proofs_dir.unwrap_or_else(|| format!("{CAIRN_DIR}/proofs")));

    let mut stones = Vec::new();
    let mut proofs = Vec::new();
    let mut unreadable = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&stones_path) {
        let mut files: Vec<PathBuf> = entries
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|path| path.extension().is_some_and(|ext| ext == "md"))
            .collect();
        files.sort();
        for file in files {
            let relative = file
                .strip_prefix(&project_root)
                .map(to_posix)
                .unwrap_or_else(|_| to_posix(&file));
            match std::fs::read_to_string(&file) {
                Ok(content) => stones.push(FileEntry {
                    path: relative,
                    content,
                }),
                Err(error) => unreadable.push(format!("{relative}: {error}")),
            }
        }
    }

    if let Ok(entries) = std::fs::read_dir(&proofs_path) {
        let mut files: Vec<PathBuf> = entries
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|path| path.to_string_lossy().ends_with(".spec.ts"))
            .collect();
        files.sort();
        for file in files {
            let relative = file
                .strip_prefix(&project_root)
                .map(to_posix)
                .unwrap_or_else(|_| to_posix(&file));
            proofs.push(relative);
        }
    }

    let mut config_path = None;
    let mut config_source = None;
    for name in CONFIG_BASENAMES {
        let candidate = project_root.join(name);
        if candidate.is_file() {
            config_path = Some(name.to_string());
            config_source = std::fs::read_to_string(&candidate).ok();
            break;
        }
    }

    Ok(CairnFiles {
        root: project_root.to_string_lossy().to_string(),
        config_path,
        config_source,
        stones,
        proofs,
        unreadable,
    })
}

#[tauri::command]
fn read_proof(root: String, proof_path: String) -> Result<String, String> {
    let project_root = find_project_root(&PathBuf::from(&root));
    let file = resolve_inside_cairn(&project_root, &proof_path)?;
    std::fs::read_to_string(&file).map_err(|error| format!("cannot read {proof_path}: {error}"))
}

/// The command line `run_verify` will spawn. `CAIRN_BIN` overrides the binary
/// (useful when the CLI is not installed globally, e.g. `pnpm exec cairn`).
fn verify_command(ids: &[String], proven_only: bool) -> Vec<String> {
    let binary = std::env::var("CAIRN_BIN").unwrap_or_else(|_| "cairn".to_string());
    let mut argv: Vec<String> = binary.split_whitespace().map(String::from).collect();
    argv.push("verify".to_string());
    argv.extend(ids.iter().cloned());
    if proven_only {
        argv.push("--proven-only".to_string());
    }
    argv
}

#[tauri::command]
fn run_verify(
    app: AppHandle,
    run_id: String,
    root: String,
    ids: Vec<String>,
    proven_only: bool,
) -> Result<String, String> {
    let project_root = find_project_root(&PathBuf::from(&root));
    let argv = verify_command(&ids, proven_only);
    let printable = argv.join(" ");

    let mut child = Command::new(&argv[0])
        .args(&argv[1..])
        .current_dir(&project_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("cannot start `{printable}`: {error}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // One thread pumps both pipes and owns the child; the command returns as
    // soon as the process is up so the UI can start rendering lines.
    thread::spawn(move || {
        let emit = |handle: &AppHandle, line: String, stream: &'static str, run_id: &str| {
            let _ = handle.emit(
                "cairn-verify-line",
                VerifyLine {
                    run_id: run_id.to_string(),
                    line,
                    stream,
                },
            );
        };

        if let Some(stderr) = stderr {
            let handle = app.clone();
            let run_id = run_id.clone();
            thread::spawn(move || {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    emit(&handle, line, "stderr", &run_id);
                }
            });
        }

        if let Some(stdout) = stdout {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                emit(&app, line, "stdout", &run_id);
            }
        }

        let code = child
            .wait()
            .ok()
            .and_then(|status| status.code())
            .unwrap_or(-1);
        let _ = app.emit("cairn-verify-end", VerifyEnd { run_id, code });
    });

    Ok(printable)
}

#[tauri::command]
fn watch_cairn(app: AppHandle, root: String, watchers: State<'_, Watchers>) -> Result<(), String> {
    let project_root = find_project_root(&PathBuf::from(&root));
    let key = project_root.to_string_lossy().to_string();
    let cairn_dir = project_root.join(CAIRN_DIR);
    if !cairn_dir.is_dir() {
        return Err(format!(
            "nothing to watch: {} is missing",
            cairn_dir.display()
        ));
    }

    let mut registry = watchers.0.lock().map_err(|error| error.to_string())?;
    if registry.contains_key(&key) {
        return Ok(());
    }

    let (tx, rx) = channel::<Result<notify::Event, notify::Error>>();
    let mut watcher =
        notify::recommended_watcher(move |event: Result<notify::Event, notify::Error>| {
            let _ = tx.send(event);
        })
        .map_err(|error| error.to_string())?;
    watcher
        .watch(&cairn_dir, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    let emitted_root = key.clone();
    thread::spawn(move || debounce_loop(app, rx, emitted_root));

    registry.insert(key, watcher);
    Ok(())
}

/// Collapse a burst of filesystem events into a single `cairn-changed`.
fn debounce_loop(app: AppHandle, rx: Receiver<Result<notify::Event, notify::Error>>, root: String) {
    let mut pending = false;
    loop {
        match rx.recv_timeout(WATCH_DEBOUNCE) {
            Ok(_) => pending = true,
            Err(RecvTimeoutError::Timeout) => {
                if pending {
                    pending = false;
                    let _ = app.emit("cairn-changed", CairnChanged { root: root.clone() });
                }
            }
            // The watcher was dropped: the window closed or the repo was
            // deselected. Nothing left to debounce.
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

#[tauri::command]
fn unwatch_cairn(root: String, watchers: State<'_, Watchers>) -> Result<(), String> {
    let project_root = find_project_root(&PathBuf::from(&root));
    let key = project_root.to_string_lossy().to_string();
    let mut registry = watchers.0.lock().map_err(|error| error.to_string())?;
    registry.remove(&key);
    Ok(())
}

/* ------------------------------------------------------------------- app */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Watchers::default())
        .invoke_handler(tauri::generate_handler![
            pick_repo,
            read_cairn,
            read_proof,
            run_verify,
            watch_cairn,
            unwatch_cairn
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Cairn desktop app");
}

/* ----------------------------------------------------------------- tests */

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verify_command_defaults_to_the_cairn_cli() {
        let argv = verify_command(&[], false);
        assert_eq!(argv, vec!["cairn", "verify"]);
    }

    #[test]
    fn verify_command_passes_ids_and_the_ratchet_flag() {
        let argv = verify_command(&["01ABC".to_string()], true);
        assert_eq!(argv, vec!["cairn", "verify", "01ABC", "--proven-only"]);
    }

    #[test]
    fn posix_paths_use_forward_slashes() {
        let path = PathBuf::from(".cairn").join("stones").join("01ABC.md");
        assert_eq!(to_posix(&path), ".cairn/stones/01ABC.md");
    }

    #[test]
    fn a_proof_outside_the_cairn_is_refused() {
        let dir = std::env::temp_dir().join("cairn-desktop-test");
        std::fs::create_dir_all(dir.join(".cairn/proofs")).unwrap();
        std::fs::write(dir.join("outside.spec.ts"), "// nope").unwrap();
        assert!(resolve_inside_cairn(&dir, "outside.spec.ts").is_err());
    }
}
