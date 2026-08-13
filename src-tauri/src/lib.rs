mod albion;
mod capture;
mod items;
mod models;
mod npcap;
mod photon;
mod prices;
mod world;

use capture::CaptureEngine;
use models::{CaptureStatus, DiscordPayload, NpcapStatus, PriceQuote};
use once_cell::sync::Lazy;
use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

static ENGINE: Lazy<Arc<CaptureEngine>> = Lazy::new(|| Arc::new(CaptureEngine::new()));

#[tauri::command]
fn npcap_status() -> NpcapStatus {
    npcap::detect()
}

#[tauri::command]
fn open_npcap_installer(app: tauri::AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(npcap::installer_url(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn start_capture(app: tauri::AppHandle) -> Result<CaptureStatus, String> {
    ENGINE.start(app)?;
    Ok(ENGINE.status(npcap::detect()))
}

#[tauri::command]
fn stop_capture() -> CaptureStatus {
    ENGINE.stop();
    ENGINE.status(npcap::detect())
}

#[tauri::command]
fn capture_status() -> CaptureStatus {
    ENGINE.status(npcap::detect())
}

#[tauri::command]
async fn send_discord_webhook(payload: DiscordPayload) -> Result<(), String> {
    if !payload.webhook_url.starts_with("https://discord.com/api/webhooks/")
        && !payload
            .webhook_url
            .starts_with("https://discordapp.com/api/webhooks/")
    {
        return Err("URL de webhook de Discord inválida.".into());
    }
    let body = serde_json::json!({
        "content": payload.content,
        "allowed_mentions": { "parse": [] }
    });
    let res = reqwest::Client::new()
        .post(&payload.webhook_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Discord respondió {}", res.status()));
    }
    Ok(())
}

#[tauri::command]
fn save_text_file(default_name: String, contents: String) -> Result<String, String> {
    let path = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .save_file()
        .ok_or_else(|| "Exportación cancelada.".to_string())?;
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
async fn fetch_item_prices(unique_names: Vec<String>) -> Result<Vec<PriceQuote>, String> {
    prices::fetch_prices(unique_names).await
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            npcap_status,
            open_npcap_installer,
            start_capture,
            stop_capture,
            capture_status,
            send_discord_webhook,
            save_text_file,
            fetch_item_prices
        ])
        .run(tauri::generate_context!())
        .expect("error while running Albion Loot Auditor");
}
