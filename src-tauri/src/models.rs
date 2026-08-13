use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcapStatus {
    pub installed: bool,
    pub dll_path: Option<String>,
    pub version_hint: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStatus {
    pub running: bool,
    pub npcap: NpcapStatus,
    pub devices: Vec<String>,
    pub packets: u64,
    pub decoded: u64,
    pub live: bool,
    pub error: Option<String>,
    pub map: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LootEvent {
    pub id: String,
    pub timestamp: i64,
    pub looted_by: String,
    pub looted_from: String,
    pub item_num_id: i32,
    pub item_unique_name: String,
    pub item_name: String,
    pub quantity: i32,
    pub enchantment: i32,
    pub quality: i32,
    pub estimated_silver: i64,
    pub is_silver: bool,
    pub map: Option<String>,
    pub guild: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeathEvent {
    pub id: String,
    pub timestamp: i64,
    pub victim: String,
    pub killer: Option<String>,
    pub guild: Option<String>,
    pub map: Option<String>,
    pub lost_items: Vec<LostItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LostItem {
    pub item_name: String,
    pub item_unique_name: String,
    pub quantity: i32,
    pub enchantment: i32,
    pub estimated_silver: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeEvent {
    pub id: String,
    pub timestamp: i64,
    pub from_player: String,
    pub to_player: String,
    pub item_name: String,
    pub item_unique_name: String,
    pub quantity: i32,
    pub enchantment: i32,
    pub estimated_silver: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageLog {
    pub id: String,
    pub timestamp: i64,
    pub player: String,
    pub action: String,
    pub item_name: String,
    pub item_unique_name: String,
    pub quantity: i32,
    pub container: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerInfo {
    pub name: String,
    pub guild: Option<String>,
    pub alliance: Option<String>,
    pub object_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterInfo {
    pub map: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscordPayload {
    pub webhook_url: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombatHit {
    pub id: String,
    pub timestamp: i64,
    pub source: String,
    pub target: String,
    pub amount: i64,
    pub map: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GearPiece {
    pub item_name: String,
    pub item_unique_name: String,
    pub enchantment: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    pub player: String,
    pub guild: Option<String>,
    pub items: Vec<GearPiece>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceQuote {
    pub unique_name: String,
    pub sell_price: i64,
    pub location: String,
}
