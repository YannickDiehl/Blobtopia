use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::info;

use crate::AppState;

/// Messages sent from server to clients
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    /// A new generation has been computed
    GenerationUpdate {
        generation_index: usize,
        generation: serde_json::Value,
    },
    /// Connection established, sending current state
    Welcome {
        generation_index: usize,
        generation: serde_json::Value,
        paused: bool,
    },
    /// Simulation paused/resumed
    SimulationStatus {
        paused: bool,
    },
}

/// Messages sent from clients to server
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    /// Request current generation
    GetCurrentGeneration,
    /// Ping to keep connection alive
    Ping,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();

    // Send welcome message with current state
    {
        let sim = state.simulation.lock().await;
        let snapshot = sim.current_snapshot();
        let gen_json = serde_json::to_value(snapshot).unwrap_or_default();
        let paused = *state.paused.lock().await;
        let welcome = ServerMessage::Welcome {
            generation_index: snapshot.tick as usize,
            generation: gen_json,
            paused,
        };
        if let Ok(msg) = serde_json::to_string(&welcome) {
            let _ = sender.send(Message::Text(msg.into())).await;
        }
    }

    // Subscribe to broadcast channel
    let mut rx = state.broadcast_tx.subscribe();

    // Spawn task to forward broadcast messages to this client
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Handle incoming messages from client
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                        match client_msg {
                            ClientMessage::Ping => { /* keep-alive, no action needed */ }
                            ClientMessage::GetCurrentGeneration => {
                                info!("Client requested current generation");
                            }
                        }
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = &mut send_task => {
            recv_task.abort();
        }
        _ = &mut recv_task => {
            send_task.abort();
        }
    }

    info!("WebSocket client disconnected");
}

/// Broadcast a generation update to all connected clients
pub fn broadcast_generation(
    tx: &broadcast::Sender<String>,
    generation_index: usize,
    generation: &serde_json::Value,
) {
    let msg = ServerMessage::GenerationUpdate {
        generation_index,
        generation: generation.clone(),
    };
    if let Ok(json) = serde_json::to_string(&msg) {
        // It's ok if no clients are connected
        let _ = tx.send(json);
    }
}

/// Broadcast simulation status change
pub fn broadcast_status(tx: &broadcast::Sender<String>, paused: bool) {
    let msg = ServerMessage::SimulationStatus { paused };
    if let Ok(json) = serde_json::to_string(&msg) {
        let _ = tx.send(json);
    }
}
