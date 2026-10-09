// Fork addition (see FORK.md 25): Mesh Avatar Studio for streaming as a desktop app. It starts
// the local server (server.rs) on 127.0.0.1:5191, the same address OBS loads the stream view
// from, and opens the Live page in a window. If that port is already taken (e.g. `npm run dev`
// is running), the window uses that server instead.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod obs;
mod server;

use std::{
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{webview::NewWindowResponse, AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};

const ADDRESS: &str = "127.0.0.1:5191";
/// fork (FORK.md 36): the editor needs the Node tools (saving rigs, rebuilding layers with the
/// Python tools), so the app starts the Vite dev server for it on this port when asked
const EDITOR_ADDRESS: &str = "127.0.0.1:5192";

/// The repository folder: projects/, samples/ and the built pages (dist-desktop/) live there.
fn repository() -> PathBuf {
    let root = std::env::var_os("MESH_AVATAR_ROOT").map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."));
    let root = root.canonicalize().unwrap_or(root);
    // canonicalize gives a \\?\ path on Windows, which Node and Vite do not always accept
    let text = root.to_string_lossy();
    text.strip_prefix(r"\\?\").map(PathBuf::from).unwrap_or(root)
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

/// Notes a problem in %TEMP%/mesh-avatar-desktop.log (the app has no console).
fn note(message: &str) {
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(std::env::temp_dir().join("mesh-avatar-desktop.log")) {
        let _ = writeln!(file, "{message}");
    }
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

/// The editor's dev server, started by the app (stopped when the app exits).
struct EditorServer(Mutex<Option<Child>>);

fn answers(address: &str) -> bool {
    address.parse().is_ok_and(|socket| TcpStream::connect_timeout(&socket, Duration::from_millis(300)).is_ok())
}

/// Starts the editor's dev server unless one already answers; true once it answers.
fn ensure_editor_server(app: &AppHandle) -> bool {
    if answers(EDITOR_ADDRESS) { return true; }
    let root = repository();
    let mut command = Command::new("node");
    command.arg(root.join("node_modules").join("vite").join("bin").join("vite.js"))
        .args(["--host", "127.0.0.1", "--port", "5192", "--strictPort"]).current_dir(&root);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console window
    }
    let child = match command.spawn() { Ok(child) => child, Err(error) => { note(&format!("editor server did not start: {error}")); return false } };
    if let Some(state) = app.try_state::<EditorServer>() { *state.0.lock().unwrap() = Some(child); }
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(40) {
        if answers(EDITOR_ADDRESS) { return true; }
        std::thread::sleep(Duration::from_millis(250));
    }
    note("editor server did not answer on 127.0.0.1:5192 within 40 s");
    false
}

/// Opens (or brings forward) the editor window; the dev server starts in the background.
fn open_editor(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("editor") { let _ = window.set_focus(); return; }
    let app = app.clone();
    std::thread::spawn(move || {
        if !ensure_editor_server(&app) { return; }
        let Ok(url) = format!("http://{EDITOR_ADDRESS}/").parse::<Url>() else { return };
        let back = app.clone();
        let _ = WebviewWindowBuilder::new(&app, "editor", WebviewUrl::External(url))
            .title("Mesh Avatar Studio · Editor")
            .inner_size(1440.0, 900.0)
            .min_inner_size(900.0, 600.0)
            // the editor's "Live" link returns to the Live window instead of opening Live here
            .on_navigation(move |url| {
                if url.port() == Some(5192) && url.path().ends_with("/live.html") { back_to_live(&back, url.query()); false } else { true }
            })
            // the editor opens Live in a new tab (target=_blank): return to the Live window too
            .on_new_window({
                let back = app.clone();
                move |url, _| {
                    if url.port() == Some(5192) && url.path().ends_with("/live.html") { back_to_live(&back, url.query()); } else { open_in_browser(&url); }
                    NewWindowResponse::Deny
                }
            })
            .build();
    });
}

/// Shows the Live window again (reloaded, on the project the editor was on) and closes the editor.
fn back_to_live(app: &AppHandle, query: Option<&str>) {
    let app = app.clone();
    let target = format!("http://{ADDRESS}/live.html{}", query.map(|q| format!("?{q}")).unwrap_or_default());
    std::thread::spawn(move || {
        if let Some(main) = app.get_webview_window("main") {
            if let Ok(url) = target.parse::<Url>() { if let Err(error) = main.navigate(url) { note(&format!("live navigate: {error}")); } }
            let _ = main.unminimize();
            let _ = main.set_focus();
        }
        match app.get_webview_window("editor") {
            Some(editor) => if let Err(error) = editor.close() { note(&format!("editor close: {error}")); },
            None => {}
        }
    });
}

fn main() {
    start_server();
    let app = tauri::Builder::default()
        .manage(EditorServer(Mutex::new(None)))
        // closing the Live window quits the app (the editor window and its server too)
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) { window.app_handle().exit(0); }
        })
        .setup(|app| {
            let url = format!("http://{ADDRESS}/live.html").parse().expect("valid url");
            let handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Mesh Avatar Studio · En vivo")
                .inner_size(1440.0, 900.0)
                .min_inner_size(900.0, 600.0)
                // fork (FORK.md 35): no Windows frame; the Live page draws its own title bar with
                // minimize, maximize and close (src/live/LiveShell.tsx), and keeps the shadow
                // and the resize borders
                .decorations(false)
                .shadow(true)
                // fork (FORK.md 36): the Live page's "Edit" link opens the editor window
                .on_navigation(move |url| {
                    let edit = matches!(url.port_or_known_default(), Some(5191)) && matches!(url.path(), "/" | "/index.html");
                    if edit { open_editor(&handle); }
                    !edit
                })
                // links meant for another tab (e.g. "open the stream view") open in the browser
                .on_new_window(|url, _| { open_in_browser(&url); NewWindowResponse::Deny })
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Mesh Avatar Studio");
    app.run(|app, event| {
        if let RunEvent::Exit = event {
            if let Some(child) = app.state::<EditorServer>().0.lock().unwrap().as_mut() { let _ = child.kill(); }
        }
    });
}
