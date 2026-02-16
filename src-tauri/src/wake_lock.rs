use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

const SETTINGS_FILE: &str = "settings.json";

pub struct WakeLockState {
    count: Mutex<u32>,
    guard: Mutex<Option<keepawake::KeepAwake>>,
    user_enabled: Mutex<bool>,
    data_dir: Mutex<Option<PathBuf>>,
}

impl Default for WakeLockState {
    fn default() -> Self {
        Self {
            count: Mutex::new(0),
            guard: Mutex::new(None),
            user_enabled: Mutex::new(false),
            data_dir: Mutex::new(None),
        }
    }
}

fn load_keep_awake(data_dir: &Path) -> bool {
    let path = data_dir.join(SETTINGS_FILE);
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("keep_awake")?.as_bool())
        .unwrap_or(false)
}

fn save_keep_awake(data_dir: &Path, enabled: bool) {
    let path = data_dir.join(SETTINGS_FILE);
    // Read existing settings to preserve other fields
    let mut settings = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    settings["keep_awake"] = serde_json::json!(enabled);
    if let Err(e) = std::fs::write(&path, serde_json::to_string_pretty(&settings).unwrap()) {
        log::warn!("[WakeLock] Failed to save preference: {}", e);
    }
}

impl WakeLockState {
    /// Initialize with a data directory. Restores saved preference and acquires wake lock if needed.
    pub fn init(&self, data_dir: &Path) {
        *self.data_dir.lock().unwrap() = Some(data_dir.to_path_buf());
        let saved = load_keep_awake(data_dir);
        if saved {
            *self.user_enabled.lock().unwrap() = true;
            self.increment();
            log::info!("[WakeLock] Restored keep-awake preference from previous session");
        }
    }

    /// Whether the user has manually enabled keep-awake.
    pub fn is_user_enabled(&self) -> bool {
        *self.user_enabled.lock().unwrap()
    }

    pub fn release_all(&self) {
        *self.count.lock().unwrap() = 0;
        *self.user_enabled.lock().unwrap() = false;
        *self.guard.lock().unwrap() = None;
    }

    /// Toggle user-requested wake lock. Returns the new checked state.
    pub fn user_toggle(&self) -> bool {
        let mut enabled = self.user_enabled.lock().unwrap();
        if *enabled {
            *enabled = false;
            self.decrement();
        } else {
            *enabled = true;
            self.increment();
        }
        let new_state = *enabled;
        drop(enabled);
        if let Some(dir) = self.data_dir.lock().unwrap().as_ref() {
            save_keep_awake(dir, new_state);
        }
        new_state
    }

    fn increment(&self) {
        let mut count = self.count.lock().unwrap();
        if *count == 0 {
            match keepawake::Builder::default()
                .display(false)
                .idle(true)
                .create()
            {
                Ok(guard) => {
                    *self.guard.lock().unwrap() = Some(guard);
                    log::info!("[WakeLock] Acquired (preventing idle sleep)");
                }
                Err(e) => {
                    log::error!("[WakeLock] Failed to acquire: {}", e);
                    return;
                }
            }
        }
        *count += 1;
        log::debug!("[WakeLock] Active count: {}", *count);
    }

    fn decrement(&self) {
        let mut count = self.count.lock().unwrap();
        *count = count.saturating_sub(1);
        if *count == 0 {
            *self.guard.lock().unwrap() = None;
            log::info!("[WakeLock] Released (idle sleep re-enabled)");
        }
        log::debug!("[WakeLock] Active count: {}", *count);
    }
}

#[tauri::command]
pub fn acquire_wake_lock(state: State<'_, WakeLockState>) -> Result<(), String> {
    state.increment();
    Ok(())
}

#[tauri::command]
pub fn release_wake_lock(state: State<'_, WakeLockState>) -> Result<(), String> {
    state.decrement();
    Ok(())
}
