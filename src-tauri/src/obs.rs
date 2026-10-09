// Fork addition (see FORK.md 33): keeps the OBS browser source in step with the Live page. The
// app server talks to OBS's own WebSocket (obs-websocket v5, built into OBS 28+) on this PC,
// with the port and password read from OBS's config file, so nobody types a password and it
// never reaches a page. It finds the browser sources showing this project's stream view and
// sets their width and height to the box chosen on the Live page.

use std::{path::PathBuf, time::Duration};


use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, Message},
};

struct ObsConfig { port: u16, password: Option<String> }

fn config() -> Result<ObsConfig, String> {
    let path = std::env::var_os("APPDATA").map(PathBuf::from).ok_or("APPDATA unknown")?
        .join("obs-studio").join("plugin_config").join("obs-websocket").join("config.json");
    let text = std::fs::read_to_string(&path).map_err(|_| "obs-websocket config not found".to_string())?;
    let value: Value = serde_json::from_str(&text).map_err(|_| "obs-websocket config unreadable".to_string())?;
    if !value["server_enabled"].as_bool().unwrap_or(false) { return Err("disabled".into()); }
    let port = value["server_port"].as_u64().and_then(|p| u16::try_from(p).ok()).unwrap_or(4455);
    let password = value["auth_required"].as_bool().unwrap_or(false)
        .then(|| value["server_password"].as_str().unwrap_or("").to_string());
    Ok(ObsConfig { port, password })
}

fn sha_b64(text: &str) -> String { STANDARD.encode(Sha256::digest(text.as_bytes())) }

/// Whether a browser source URL is this app's stream view for `project`.
fn is_stream_view(url: &str, project: &str) -> bool {
    let Some(rest) = url.strip_prefix("http://127.0.0.1:5191/stream.html").or_else(|| url.strip_prefix("http://localhost:5191/stream.html")) else { return false };
    let query = rest.strip_prefix('?').unwrap_or("");
    query.split('&').any(|pair| pair == format!("project={project}"))
}

/// Sets every matching browser source to `width` x `height`; returns how many were changed.
pub async fn apply_size(project: &str, width: u32, height: u32) -> Result<usize, String> {
    tokio::time::timeout(Duration::from_secs(4), apply(project, Some((width, height)))).await.map_err(|_| "timeout".to_string())?
}
/// How many browser sources show this project's stream view.
pub async fn count_sources(project: &str) -> Result<usize, String> {
    tokio::time::timeout(Duration::from_secs(4), apply(project, None)).await.map_err(|_| "timeout".to_string())?
}

type Socket = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;
struct Client { socket: Socket, next: u32 }

impl Client {
    /// Reads until the message with this op code (and request id, for responses).
    async fn read(&mut self, op: u64, id: Option<&str>) -> Result<Value, String> {
        while let Some(message) = self.socket.next().await {
            let Ok(Message::Text(text)) = message else { continue };
            let Ok(value) = serde_json::from_str::<Value>(&text) else { continue };
            if value["op"].as_u64() == Some(op) && id.is_none_or(|id| value["d"]["requestId"].as_str() == Some(id)) { return Ok(value["d"].clone()); }
        }
        Err("closed".into())
    }
    async fn send(&mut self, value: Value) -> Result<(), String> {
        self.socket.send(Message::Text(value.to_string().into())).await.map_err(|e| e.to_string())
    }
    async fn call(&mut self, kind: &str, data: Value) -> Result<Value, String> {
        self.next += 1;
        let id = self.next.to_string();
        self.send(json!({ "op": 6, "d": { "requestType": kind, "requestId": id, "requestData": data } })).await?;
        let response = self.read(7, Some(&id)).await?;
        if response["requestStatus"]["result"].as_bool() == Some(true) { Ok(response["responseData"].clone()) } else { Err(format!("{kind} failed")) }
    }
}

async fn apply(project: &str, size: Option<(u32, u32)>) -> Result<usize, String> {
    let config = config()?;
    let mut request = format!("ws://127.0.0.1:{}", config.port).into_client_request().map_err(|e| e.to_string())?;
    request.headers_mut().insert("Sec-WebSocket-Protocol", HeaderValue::from_static("obswebsocket.json"));
    let (socket, _) = connect_async(request).await.map_err(|_| "unreachable".to_string())?;
    let mut client = Client { socket, next: 0 };
    let hello = client.read(0, None).await?;
    let mut identify = json!({ "rpcVersion": 1, "eventSubscriptions": 0 });
    if let Some(auth) = hello.get("authentication") {
        let password = config.password.clone().ok_or("password required")?;
        let secret = sha_b64(&format!("{password}{}", auth["salt"].as_str().unwrap_or("")));
        identify["authentication"] = json!(sha_b64(&format!("{secret}{}", auth["challenge"].as_str().unwrap_or(""))));
    }
    client.send(json!({ "op": 1, "d": identify })).await?;
    client.read(2, None).await.map_err(|_| "authentication failed".to_string())?;
    let inputs = client.call("GetInputList", json!({ "inputKind": "browser_source" })).await?;
    let mut changed = 0;
    for input in inputs["inputs"].as_array().into_iter().flatten() {
        let Some(name) = input["inputName"].as_str() else { continue };
        let settings = client.call("GetInputSettings", json!({ "inputName": name })).await?;
        if !is_stream_view(settings["inputSettings"]["url"].as_str().unwrap_or(""), project) { continue; }
        if let Some((width, height)) = size {
            client.call("SetInputSettings", json!({ "inputName": name, "inputSettings": { "width": width, "height": height }, "overlay": true })).await?;
        }
        changed += 1;
    }
    let _ = client.socket.close(None).await;
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finds_this_projects_stream_view() {
        assert!(is_stream_view("http://127.0.0.1:5191/stream.html?project=tigre-3d&bg=transparent", "tigre-3d"));
        assert!(is_stream_view("http://localhost:5191/stream.html?bg=x&project=tigre-3d", "tigre-3d"));
        assert!(!is_stream_view("http://127.0.0.1:5191/stream.html?project=tigre", "tigre-3d"));
        assert!(!is_stream_view("https://example.com/stream.html?project=tigre-3d", "tigre-3d"));
        assert_eq!(sha_b64("abc"), "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=");
    }
}
