use std::sync::Mutex;
use tauri::State;

pub struct WakeLockState {
    count: Mutex<u32>,
    guard: Mutex<Option<keepawake::KeepAwake>>,
    user_enabled: Mutex<bool>,
}

impl Default for WakeLockState {
    fn default() -> Self {
        Self {
            count: Mutex::new(0),
            guard: Mutex::new(None),
            user_enabled: Mutex::new(false),
        }
    }
}

impl WakeLockState {
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
        *enabled
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
