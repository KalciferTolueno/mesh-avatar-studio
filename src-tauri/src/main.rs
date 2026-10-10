// Fork addition (see FORK.md 25): Mesh Avatar Studio for streaming as a desktop app. It starts
// the local server (server.rs) on 127.0.0.1:5191, the same address OBS loads the stream view
// from, and opens the Live page in a window. If that port is already taken (e.g. `npm run dev`
// is running), the window uses that server instead. The editor is a separate app (`npm run dev`,
// FORK.md 37): this window has no link to it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod obs;
mod server;

use std::{net::TcpListener, path::PathBuf, process::Command, sync::Arc};
use tauri::{webview::NewWindowResponse, Url, WebviewUrl, WebviewWindowBuilder};

const ADDRESS: &str = "127.0.0.1:5191";

/// The repository folder: projects/, samples/ and the built pages (dist-desktop/) live there.
fn repository() -> PathBuf {
    let root = std::env::var_os("MESH_AVATAR_ROOT").map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."));
    root.canonicalize().unwrap_or(root)
}

/// Opens a link in the default browser (links that ask for a new window).
fn open_in_browser(url: &Url) {
    if !matches!(url.scheme(), "http" | "https") { return; }
    let mut command = Command::new("cmd");
    command.args(["/C", "start", "", url.as_str()]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    let _ = command.spawn();
}

fn start_server() {
    let Ok(listener) = TcpListener::bind(ADDRESS) else { return };
    let root = repository();
    let paths = Arc::new(server::Paths {
        dist: root.join("dist-desktop"), projects: root.join("projects"), sample: root.join("samples").join("miko-qipao"), root,
    });
    std::thread::spawn(move || {
        let runtime = tokio::runtime::Builder::new_multi_thread().worker_threads(2).enable_all().build().expect("tokio runtime");
        runtime.block_on(async move {
            listener.set_nonblocking(true).expect("non-blocking listener");
            let listener = tokio::net::TcpListener::from_std(listener).expect("listener");
            let _ = axum::serve(listener, server::router(paths)).await;
        });
    });
}

fn main() {
    start_server();
    tauri::Builder::default()
        .setup(|app| {
            let url = format!("http://{ADDRESS}/live.html").parse().expect("valid url");
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Mesh Avatar Studio · En vivo")
                .inner_size(1440.0, 900.0)
                .min_inner_size(900.0, 600.0)
                // fork (FORK.md 35): no Windows frame; the Live page draws its own title bar with
                // minimize, maximize and close (src/live/LiveShell.tsx), and keeps the shadow
                // and the resize borders
                .decorations(false)
                .shadow(true)
                // links meant for another tab (e.g. "open the stream view") open in the browser
                .on_new_window(|url, _| { open_in_browser(&url); NewWindowResponse::Deny })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Mesh Avatar Studio");
}
