// Prevent a console window from opening alongside the app on Windows release
// builds. Everything else lives in lib.rs.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cairn_desktop_lib::run()
}
