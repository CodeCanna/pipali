use std::time::Duration;
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::{show_window, start_sidecar, stop_sidecar, SidecarState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachedFileInfo {
    pub file_path: String,
    pub file_name: String,
    pub size_bytes: u64,
}

#[derive(Serialize)]
pub struct SidecarConfig {
    pub host: String,
    pub port: u16,
}

/// Get the sidecar port (exposed to frontend)
#[tauri::command]
pub fn get_sidecar_port(state: State<'_, SidecarState>) -> u16 {
    state.port
}

/// Get the sidecar host (exposed to frontend)
#[tauri::command]
pub fn get_sidecar_host(state: State<'_, SidecarState>) -> String {
    state.host.clone()
}

/// Get the sidecar config (host and port) - exposed to frontend
#[tauri::command]
pub fn get_sidecar_config(state: State<'_, SidecarState>) -> SidecarConfig {
    SidecarConfig {
        host: state.host.clone(),
        port: state.port,
    }
}

/// Restart the sidecar (exposed to frontend)
#[tauri::command]
pub async fn restart_sidecar(app: AppHandle) -> Result<(), String> {
    stop_sidecar(&app)?;
    // Small delay to ensure clean shutdown
    std::thread::sleep(Duration::from_millis(500));
    start_sidecar(&app)
}

/// Show the app window and add it to the dock (exposed to frontend)
#[tauri::command]
pub fn focus_window(app: AppHandle) {
    show_window(&app);
}

/// Read metadata for dropped files
#[tauri::command]
pub async fn get_dropped_file_metadata(paths: Vec<String>) -> Result<Vec<AttachedFileInfo>, String> {
    let mut results = Vec::new();
    for source_path_str in paths {
        let source = std::path::PathBuf::from(&source_path_str);
        if !source.exists() || !source.is_file() {
            continue;
        }

        let file_name = source
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        let metadata = std::fs::metadata(&source)
            .map_err(|e| format!("Failed to read metadata for {}: {}", source_path_str, e))?;

        results.push(AttachedFileInfo {
            file_path: source_path_str,
            file_name,
            size_bytes: metadata.len(),
        });
    }

    Ok(results)
}
