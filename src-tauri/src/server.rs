// Fork addition (see FORK.md 25): the desktop app's local server. It does for streaming what the
// Vite dev server plugins do under `npm run dev`:
//   /__bus                     WebSocket relay between the Live page and the OBS stream views
//                              (src/live/bus.ts); receivers validate every message
//   /__studio/projects[...]    project list and read-only project files (src/server/local-projects.ts)
//   /__items/...               accessories and backgrounds (src/server/project-items.ts)
//   everything else            the built pages (vite build --mode desktop -> dist-desktop/)
// Same rules as the Node plugins: local host and origin only, safe names, nothing outside the
// project folder, uploaded files checked by their bytes. Editing projects stays in the editor.

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, OnceLock,
    },
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use axum::{
    body::{Body, Bytes},
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        DefaultBodyLimit, Path as UrlPath, Request, State,
    },
    http::{header, HeaderMap, HeaderValue, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Redirect, Response},
    routing::get,
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use regex::Regex;
use serde_json::{json, Value};
use tokio::sync::broadcast;
use tower_http::services::ServeDir;

const SAMPLE: &str = "sample-miko-qipao";
const MAX_ITEMS: usize = 16;
const MAX_PICTURE: usize = 10 * 1024 * 1024;
const MAX_BACKGROUND: usize = 60 * 1024 * 1024;
const MAX_MESSAGE: usize = 256 * 1024;
const BUS_EVENTS: [&str; 7] = ["studio:live-params", "studio:lighting", "studio:physics", "studio:frame", "studio:items", "studio:background", "studio:stream-hello"];

pub struct Paths {
    pub root: PathBuf,
    pub dist: PathBuf,
    pub projects: PathBuf,
    pub sample: PathBuf,
}

#[derive(Clone)]
struct AppState {
    paths: Arc<Paths>,
    bus: broadcast::Sender<(u64, Arc<str>)>,
}

fn re(pattern: &'static str, cell: &'static OnceLock<Regex>) -> &'static Regex {
    cell.get_or_init(|| Regex::new(pattern).expect("valid pattern"))
}
fn safe_name(value: &str) -> bool {
    static CELL: OnceLock<Regex> = OnceLock::new();
    value != "." && value != ".." && re(r"^[A-Za-z0-9._-]+$", &CELL).is_match(value)
}
fn project_name(value: &str) -> bool {
    static CELL: OnceLock<Regex> = OnceLock::new();
    value != "." && value != ".." && re(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$", &CELL).is_match(value)
}
fn item_file(value: &str) -> bool {
    static CELL: OnceLock<Regex> = OnceLock::new();
    re(r"^[a-z0-9-]{1,60}\.(png|webp|jpg)$", &CELL).is_match(value)
}
fn background_file(value: &str) -> bool {
    static CELL: OnceLock<Regex> = OnceLock::new();
    re(r"^[a-z0-9-]{1,60}\.(png|jpg|webp|gif|mp4|webm)$", &CELL).is_match(value)
}
fn item_id(value: &str) -> bool {
    static CELL: OnceLock<Regex> = OnceLock::new();
    re(r"^[a-z0-9]{4,24}$", &CELL).is_match(value)
}

fn error(status: StatusCode, message: &str) -> Response {
    let mut response = (status, Json(json!({ "error": message }))).into_response();
    no_store(response.headers_mut());
    response
}
fn no_store(headers: &mut HeaderMap) {
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert("x-content-type-options", HeaderValue::from_static("nosniff"));
}
fn json_ok(value: Value) -> Response {
    let mut response = Json(value).into_response();
    no_store(response.headers_mut());
    response
}
fn bytes_response(bytes: Vec<u8>, content_type: &'static str) -> Response {
    let mut response = Response::new(Body::from(bytes));
    response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
    no_store(response.headers_mut());
    response
}
fn content_type(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "json" => Some("application/json"),
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "mp4" => Some("video/mp4"),
        "webm" => Some("video/webm"),
        _ => None,
    }
}

/// `path` resolved and still inside `base` (both followed through links).
fn inside(base: &Path, path: &Path) -> Option<PathBuf> {
    let base = base.canonicalize().ok()?;
    let path = path.canonicalize().ok()?;
    path.starts_with(&base).then_some(path)
}

/// Local requests from this app's own pages only (OBS included), never from another website.
async fn local_only(request: Request, next: Next) -> Response {
    let host = request.headers().get(header::HOST).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let hostname = host.rsplit_once(':').map(|(h, _)| h).unwrap_or(&host);
    if hostname != "127.0.0.1" && hostname != "localhost" {
        return error(StatusCode::FORBIDDEN, "Local requests only.");
    }
    if let Some(origin) = request.headers().get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        if origin != format!("http://{host}") {
            return error(StatusCode::FORBIDDEN, "Use the local studio origin.");
        }
    }
    next.run(request).await
}

pub fn router(paths: Arc<Paths>) -> Router {
    let (bus, _) = broadcast::channel(256);
    let state = AppState { paths: paths.clone(), bus };
    Router::new()
        .route("/", get(|| async { Redirect::temporary("/live.html") }))
        .route("/index.html", get(|| async { Redirect::temporary("/live.html") }))
        .route("/__bus", get(bus_socket))
        .route("/__studio/context", get(context))
        .route("/__studio/projects", get(list_projects))
        .route("/__studio/projects/{name}/{*file}", get(project_file))
        .route("/__items/{name}", get(items_get).put(items_put))
        .route("/__items/{name}/upload", axum::routing::post(item_upload))
        .route("/__items/{name}/file/{file}", get(item_get).delete(item_delete))
        .route("/__items/{name}/backgrounds", get(backgrounds_list))
        .route("/__items/{name}/upload-background", axum::routing::post(background_upload))
        .route("/__items/{name}/background/{file}", get(background_get).delete(background_delete))
        .fallback_service(ServeDir::new(&paths.dist))
        .layer(DefaultBodyLimit::max(MAX_BACKGROUND + 1024 * 1024))
        .layer(middleware::from_fn(local_only))
        .with_state(state)
}

// ---- message bus ---------------------------------------------------------------------------

static NEXT_CLIENT: AtomicU64 = AtomicU64::new(1);

async fn bus_socket(State(state): State<AppState>, upgrade: WebSocketUpgrade) -> Response {
    upgrade.max_message_size(MAX_MESSAGE).on_upgrade(move |socket| bus_client(socket, state))
}

async fn bus_client(socket: WebSocket, state: AppState) {
    let id = NEXT_CLIENT.fetch_add(1, Ordering::Relaxed);
    let (mut sink, mut stream) = socket.split();
    let mut inbox = state.bus.subscribe();
    let forward = tokio::spawn(async move {
        loop {
            match inbox.recv().await {
                Ok((from, text)) if from != id => {
                    if sink.send(Message::Text(text.to_string().into())).await.is_err() { break; }
                }
                Ok(_) => {}
                Err(broadcast::error::RecvError::Lagged(_)) => {}
                Err(_) => break,
            }
        }
    });
    // like the Vite relays: at most 60 messages a second per event from each page
    let mut last: HashMap<String, Instant> = HashMap::new();
    while let Some(Ok(message)) = stream.next().await {
        let Message::Text(text) = message else { continue };
        let Ok(value) = serde_json::from_str::<Value>(&text) else { continue };
        let Some(event) = value.get("event").and_then(Value::as_str) else { continue };
        if !BUS_EVENTS.contains(&event) || value.get("data").is_none() { continue; }
        let now = Instant::now();
        if last.get(event).is_some_and(|at| now.duration_since(*at).as_millis() < 16) { continue; }
        last.insert(event.to_string(), now);
        let _ = state.bus.send((id, Arc::from(text.as_str())));
    }
    forward.abort();
}

// ---- projects (read-only) ------------------------------------------------------------------

fn display(path: &Path) -> String {
    let text = path.to_string_lossy().to_string();
    text.strip_prefix(r"\\?\").map(str::to_string).unwrap_or(text)
}

fn iso(time: SystemTime) -> String {
    let secs = time.duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let (days, rest) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // civil date from days since 1970-01-01 (Howard Hinnant's algorithm)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.000Z", rest / 3600, rest % 3600 / 60, rest % 60)
}

fn project_folder(paths: &Paths, name: &str) -> Option<PathBuf> {
    if !safe_name(name) || name.starts_with(".studio-job-") { return None; }
    let (parent, path) = if name == SAMPLE { (paths.sample.parent()?.to_path_buf(), paths.sample.clone()) } else { (paths.projects.clone(), paths.projects.join(name)) };
    let path = inside(&parent, &path)?;
    path.is_dir().then_some(path)
}

fn project_info(paths: &Paths, name: &str) -> Option<Value> {
    let path = project_folder(paths, name)?;
    let rig = path.join("rig.json");
    let draft = path.join("rig.draft.json");
    let rig_file = if rig.is_file() { "rig.json" } else if draft.is_file() && path.join("built").is_dir() { "rig.draft.json" } else { return None };
    if name == SAMPLE && (!path.join("source.png").is_file() || !path.join("built/base.png").is_file()) { return None; }
    let updated = std::fs::metadata(path.join(rig_file)).and_then(|m| m.modified()).map(iso).unwrap_or_default();
    let relative = path.strip_prefix(paths.root.canonicalize().ok()?).ok()?.to_string_lossy().replace('\\', "/");
    Some(json!({
        "name": name, "relativePath": relative, "absolutePath": display(&path), "displayPath": display(&path),
        "rigFile": rig_file, "updatedAt": updated,
        "hasSprites": path.join("built/sprites/sprites.json").is_file(), "hasVariants": path.join("variants").is_dir(),
        "readOnly": name == SAMPLE,
    }))
}

async fn context(State(state): State<AppState>) -> Response {
    let root = display(&state.paths.root);
    json_ok(json!({ "rootPath": root, "displayRootPath": root }))
}

async fn list_projects(State(state): State<AppState>) -> Response {
    let paths = state.paths.clone();
    let list = tokio::task::spawn_blocking(move || {
        let mut list: Vec<Value> = std::fs::read_dir(&paths.projects).into_iter().flatten().flatten()
            .filter(|entry| entry.file_type().map(|t| t.is_dir()).unwrap_or(false))
            .filter_map(|entry| entry.file_name().into_string().ok())
            .filter(|name| !name.starts_with('.') && name != SAMPLE)
            .filter_map(|name| project_info(&paths, &name))
            .collect();
        list.extend(project_info(&paths, SAMPLE));
        list.sort_by(|a, b| b["updatedAt"].as_str().cmp(&a["updatedAt"].as_str()));
        list
    }).await.unwrap_or_default();
    json_ok(Value::Array(list))
}

async fn project_file(State(state): State<AppState>, UrlPath((name, file)): UrlPath<(String, String)>) -> Response {
    let parts: Vec<&str> = file.split('/').collect();
    if parts.iter().any(|part| !safe_name(part)) { return error(StatusCode::BAD_REQUEST, "Invalid path segment."); }
    let allowed = matches!(file.as_str(), "rig.json" | "rig.draft.json" | "source.png") || matches!(parts[0], "built" | "variants");
    let Some(folder) = project_folder(&state.paths, &name) else { return error(StatusCode::NOT_FOUND, "Project not found.") };
    let target = parts.iter().fold(folder.clone(), |path, part| path.join(part));
    let (true, Some(kind), Some(target)) = (allowed, content_type(&target), inside(&folder, &target)) else {
        return error(StatusCode::NOT_FOUND, "File not available.");
    };
    match tokio::fs::read(&target).await {
        Ok(bytes) => bytes_response(bytes, kind),
        Err(_) => error(StatusCode::NOT_FOUND, "Project or file not found."),
    }
}

// ---- accessories and backgrounds -----------------------------------------------------------

/// projects/<name>/<kind>, inside the project; created on request.
fn media_folder(paths: &Paths, name: &str, kind: &str, create: bool) -> Result<PathBuf, Response> {
    if !project_name(name) { return Err(error(StatusCode::BAD_REQUEST, "Invalid project name.")); }
    let project = inside(&paths.projects, &paths.projects.join(name)).filter(|p| p.is_dir())
        .ok_or_else(|| error(StatusCode::NOT_FOUND, "Project not found."))?;
    let folder = project.join(kind);
    if create { std::fs::create_dir_all(&folder).map_err(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "Items operation failed."))?; }
    if folder.exists() && inside(&project, &folder).is_none() { return Err(error(StatusCode::BAD_REQUEST, "Folder cannot redirect elsewhere.")); }
    Ok(folder)
}

fn atomic_write(dir: &Path, file: &str, data: &[u8]) -> std::io::Result<()> {
    let temporary = dir.join(format!(".{file}-{:012x}.tmp", rand::rng().random::<u64>() & 0xffff_ffff_ffff));
    let result = std::fs::write(&temporary, data).and_then(|_| std::fs::rename(&temporary, dir.join(file)));
    let _ = std::fs::remove_file(&temporary);
    result
}

fn slug(name: &str) -> String {
    let lower = name.to_lowercase();
    let stem = match lower.rfind('.') { Some(i) if lower[i + 1..].chars().all(|c| c.is_ascii_alphanumeric()) => &lower[..i], _ => &lower[..] };
    let mut out = String::new();
    for c in stem.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() { out.push(c) } else if !out.ends_with('-') { out.push('-') }
    }
    out.trim_matches('-').chars().take(40).collect::<String>().trim_end_matches('-').to_string()
}
fn random_hex() -> String { format!("{:08x}", rand::rng().random::<u32>()) }

fn picture_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() > 8 && bytes[0] == 0x89 && &bytes[1..4] == b"PNG" { return Some("png"); }
    if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" { return Some("webp"); }
    if bytes.len() > 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff { return Some("jpg"); }
    None
}
fn background_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() > 6 && &bytes[0..4] == b"GIF8" { return Some("gif"); }
    if bytes.len() > 12 && &bytes[4..8] == b"ftyp" { return Some("mp4"); }
    if bytes.len() > 4 && bytes[0..4] == [0x1a, 0x45, 0xdf, 0xa3] { return Some("webm"); }
    picture_type(bytes)
}

/// The same checks as src/live/items.ts parseItems (the pages clamp the values on load).
fn valid_items(value: &Value) -> bool {
    let Some(list) = value.as_array() else { return false };
    if list.len() > MAX_ITEMS { return false; }
    let mut ids = std::collections::HashSet::new();
    list.iter().all(|item| {
        let text = |key: &str| item.get(key).and_then(Value::as_str);
        let number = |key: &str| item.get(key).and_then(Value::as_f64).is_some_and(f64::is_finite);
        text("id").is_some_and(item_id) && ids.insert(text("id").unwrap_or("").to_string())
            && text("file").is_some_and(item_file) && text("name").is_some()
            && ["x", "y", "scale", "rotation"].iter().all(|key| number(key))
            && matches!(text("attach"), Some("head" | "body" | "none")) && matches!(text("layer"), Some("front" | "behind"))
    })
}

async fn items_get(State(state): State<AppState>, UrlPath(name): UrlPath<String>) -> Response {
    let folder = match media_folder(&state.paths, &name, "items", false) { Ok(f) => f, Err(r) => return r };
    let list = std::fs::read_to_string(folder.join("items.json")).ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok()).filter(valid_items).unwrap_or(json!([]));
    json_ok(list)
}

async fn items_put(State(state): State<AppState>, UrlPath(name): UrlPath<String>, headers: HeaderMap, body: Bytes) -> Response {
    if !is_type(&headers, "application/json") { return error(StatusCode::BAD_REQUEST, "Send application/json."); }
    if body.len() > 256 * 1024 { return error(StatusCode::PAYLOAD_TOO_LARGE, "Request is too large."); }
    let Ok(list) = serde_json::from_slice::<Value>(&body) else { return error(StatusCode::BAD_REQUEST, "Invalid JSON.") };
    if !valid_items(&list) { return error(StatusCode::BAD_REQUEST, "Invalid items."); }
    let folder = match media_folder(&state.paths, &name, "items", true) { Ok(f) => f, Err(r) => return r };
    let text = serde_json::to_string_pretty(&list).unwrap_or_default() + "\n";
    match atomic_write(&folder, "items.json", text.as_bytes()) {
        Ok(()) => json_ok(json!({ "saved": list.as_array().map(Vec::len).unwrap_or(0) })),
        Err(_) => error(StatusCode::INTERNAL_SERVER_ERROR, "Items operation failed."),
    }
}

fn is_type(headers: &HeaderMap, wanted: &str) -> bool {
    headers.get(header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).map(|v| v.split(';').next().unwrap_or("").trim() == wanted).unwrap_or(false)
}

async fn item_upload(State(state): State<AppState>, UrlPath(name): UrlPath<String>, headers: HeaderMap, body: Bytes) -> Response {
    use base64_lite::decode;
    if !is_type(&headers, "application/json") { return error(StatusCode::BAD_REQUEST, "Send application/json."); }
    let Ok(value) = serde_json::from_slice::<Value>(&body) else { return error(StatusCode::BAD_REQUEST, "Invalid JSON.") };
    let Some(bytes) = value.get("data").and_then(Value::as_str).and_then(decode) else { return error(StatusCode::BAD_REQUEST, "Send a PNG, WebP or JPEG picture.") };
    let Some(kind) = picture_type(&bytes) else { return error(StatusCode::BAD_REQUEST, "Send a PNG, WebP or JPEG picture.") };
    if bytes.len() > MAX_PICTURE { return error(StatusCode::PAYLOAD_TOO_LARGE, "Picture is too large."); }
    let base = slug(value.get("name").and_then(Value::as_str).unwrap_or(""));
    let stored = format!("{}-{}.{kind}", if base.is_empty() { "item".to_string() } else { base }, random_hex());
    let folder = match media_folder(&state.paths, &name, "items", true) { Ok(f) => f, Err(r) => return r };
    match atomic_write(&folder, &stored, &bytes) {
        Ok(()) => json_ok(json!({ "file": stored })),
        Err(_) => error(StatusCode::INTERNAL_SERVER_ERROR, "Items operation failed."),
    }
}

async fn serve_media(paths: &Paths, name: &str, kind: &str, file: &str, ok: fn(&str) -> bool) -> Response {
    if !ok(file) { return error(StatusCode::NOT_FOUND, "Not found."); }
    let folder = match media_folder(paths, name, kind, false) { Ok(f) => f, Err(r) => return r };
    let Some(path) = inside(&folder, &folder.join(file)) else { return error(StatusCode::NOT_FOUND, "Project or file not found.") };
    match (tokio::fs::read(&path).await, content_type(&path)) {
        (Ok(bytes), Some(kind)) => bytes_response(bytes, kind),
        _ => error(StatusCode::NOT_FOUND, "Project or file not found."),
    }
}
async fn delete_media(paths: &Paths, name: &str, kind: &str, file: &str, ok: fn(&str) -> bool) -> Response {
    if !ok(file) { return error(StatusCode::NOT_FOUND, "Not found."); }
    let folder = match media_folder(paths, name, kind, false) { Ok(f) => f, Err(r) => return r };
    match inside(&folder, &folder.join(file)).map(std::fs::remove_file) {
        Some(Ok(())) => json_ok(json!({ "deleted": file })),
        _ => error(StatusCode::NOT_FOUND, "Project or file not found."),
    }
}

async fn item_get(State(state): State<AppState>, UrlPath((name, file)): UrlPath<(String, String)>) -> Response {
    serve_media(&state.paths, &name, "items", &file, item_file).await
}
async fn item_delete(State(state): State<AppState>, UrlPath((name, file)): UrlPath<(String, String)>) -> Response {
    delete_media(&state.paths, &name, "items", &file, item_file).await
}

async fn backgrounds_list(State(state): State<AppState>, UrlPath(name): UrlPath<String>) -> Response {
    let folder = match media_folder(&state.paths, &name, "backgrounds", false) { Ok(f) => f, Err(r) => return r };
    let mut files: Vec<String> = std::fs::read_dir(&folder).into_iter().flatten().flatten()
        .filter_map(|entry| entry.file_name().into_string().ok()).filter(|file| background_file(file)).collect();
    files.sort();
    json_ok(json!(files))
}

async fn background_upload(State(state): State<AppState>, UrlPath(name): UrlPath<String>, headers: HeaderMap, body: Bytes) -> Response {
    if !is_type(&headers, "application/octet-stream") { return error(StatusCode::BAD_REQUEST, "Send the file bytes."); }
    if body.len() > MAX_BACKGROUND { return error(StatusCode::PAYLOAD_TOO_LARGE, "File is too large."); }
    let Some(kind) = background_type(&body) else { return error(StatusCode::BAD_REQUEST, "Send a PNG, JPEG, WebP or GIF picture, or an MP4 or WebM video.") };
    let original = headers.get("x-file-name").and_then(|v| v.to_str().ok()).map(percent_decode).unwrap_or_default();
    let base = slug(&original);
    let stored = format!("{}-{}.{kind}", if base.is_empty() { "background".to_string() } else { base }, random_hex());
    let folder = match media_folder(&state.paths, &name, "backgrounds", true) { Ok(f) => f, Err(r) => return r };
    match atomic_write(&folder, &stored, &body) {
        Ok(()) => json_ok(json!({ "file": stored })),
        Err(_) => error(StatusCode::INTERNAL_SERVER_ERROR, "Items operation failed."),
    }
}
async fn background_get(State(state): State<AppState>, UrlPath((name, file)): UrlPath<(String, String)>) -> Response {
    serve_media(&state.paths, &name, "backgrounds", &file, background_file).await
}
async fn background_delete(State(state): State<AppState>, UrlPath((name, file)): UrlPath<(String, String)>) -> Response {
    delete_media(&state.paths, &name, "backgrounds", &file, background_file).await
}

fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() && text.is_char_boundary(i + 3) {
            if let Ok(value) = u8::from_str_radix(&text[i + 1..i + 3], 16) { out.push(value); i += 3; continue; }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// Minimal standard base64 decoding for accessory uploads (no padding errors tolerated).
mod base64_lite {
    pub fn decode(text: &str) -> Option<Vec<u8>> {
        let value = |c: u8| -> Option<u32> {
            Some(match c { b'A'..=b'Z' => c - b'A', b'a'..=b'z' => c - b'a' + 26, b'0'..=b'9' => c - b'0' + 52, b'+' => 62, b'/' => 63, _ => return None } as u32)
        };
        let trimmed = text.trim_end_matches('=');
        if text.len() % 4 != 0 || text.len() - trimmed.len() > 2 { return None; }
        let mut out = Vec::with_capacity(trimmed.len() * 3 / 4);
        let (mut buffer, mut bits) = (0u32, 0);
        for c in trimmed.bytes() {
            buffer = (buffer << 6) | value(c)?;
            bits += 6;
            if bits >= 8 { bits -= 8; out.push((buffer >> bits) as u8); }
        }
        Some(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names_and_types() {
        assert!(safe_name("tigre-3d") && !safe_name("..") && !safe_name("a/b"));
        assert!(item_file("gafas-0a1b2c3d.png") && !item_file("../rig.json"));
        assert!(background_file("cuarto-0a1b2c3d.webm") && !background_file("x.exe"));
        assert_eq!(picture_type(&[0x89, b'P', b'N', b'G', 13, 10, 26, 10, 0, 0]), Some("png"));
        assert_eq!(background_type(b"GIF89a\0\0"), Some("gif"));
        assert_eq!(background_type(b"<svg onload=x>"), None);
        assert_eq!(slug("Mis Gafas!.png"), "mis-gafas");
        assert_eq!(base64_lite::decode("aGk="), Some(b"hi".to_vec()));
        assert_eq!(percent_decode("Mi%20Cuarto.gif"), "Mi Cuarto.gif");
        assert_eq!(iso(UNIX_EPOCH + std::time::Duration::from_secs(1_760_000_000)), "2025-10-09T08:53:20.000Z");
    }
    #[test]
    fn items_are_checked() {
        let good = json!([{ "id": "abcd12", "file": "g-0a1b2c3d.png", "name": "G", "x": 1, "y": 2, "scale": 1, "rotation": 0, "flip": false, "attach": "head", "layer": "front", "visible": true }]);
        assert!(valid_items(&good));
        let mut bad = good.clone(); bad[0]["file"] = json!("../../rig.json"); assert!(!valid_items(&bad));
        let mut twice = good.clone(); twice.as_array_mut().unwrap().push(good[0].clone()); assert!(!valid_items(&twice));
    }
}
