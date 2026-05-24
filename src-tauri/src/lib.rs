#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![write_board_archive])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn write_board_archive(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let path = std::path::PathBuf::from(path);

    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| !extension.eq_ignore_ascii_case("board"))
        .unwrap_or(true)
    {
        return Err(
            "Export failed because the selected file must use the .board extension.".into(),
        );
    }

    std::fs::write(&path, bytes).map_err(|error| {
        format!(
            "Export failed because LocalDeck could not write {}: {}",
            path.display(),
            error
        )
    })
}
