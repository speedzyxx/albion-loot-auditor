//! Maps decoded Photon messages onto typed Albion session events.
//!
//! Event numeric codes change every Albion patch. We combine:
//!   1. Configurable code lists (easy to update)
//!   2. Parameter-signature heuristics used by community loot loggers
//!
//! Game events typically arrive as Photon eventCode=1 with the real code in
//! parameter 252.

use crate::models::{
    ClusterInfo, DeathEvent, LootEvent, LostItem, PlayerInfo, StorageLog, TradeEvent,
};
use crate::photon::{PhotonMessage, PhotonValue};
use serde::Serialize;
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SessionEvent {
    Loot(LootEvent),
    Death(DeathEvent),
    Trade(TradeEvent),
    Storage(StorageLog),
    Player(PlayerInfo),
    Cluster(ClusterInfo),
}

#[derive(Default)]
pub struct SessionWorld {
    pub players_by_id: BTreeMap<i32, PlayerInfo>,
    pub players_by_name: BTreeMap<String, PlayerInfo>,
    pub current_map: Option<String>,
    /// objectId -> pending loot bag owner
    pub loot_owners: BTreeMap<i32, String>,
    pub item_names: BTreeMap<i32, (String, String, i32)>,
}

impl SessionWorld {
    pub fn ingest(&mut self, messages: Vec<PhotonMessage>) -> Vec<SessionEvent> {
        let mut out = Vec::new();
        for msg in messages {
            match msg {
                PhotonMessage::Event {
                    event_code,
                    parameters,
                } => {
                    let game_code = parameters
                        .get(&252)
                        .and_then(PhotonValue::as_i64)
                        .unwrap_or(event_code as i64);
                    if let Some(ev) = self.handle_event(game_code, &parameters) {
                        out.push(ev);
                    }
                }
                PhotonMessage::Request {
                    operation_code,
                    parameters,
                } => {
                    if let Some(ev) = self.handle_operation(operation_code, &parameters) {
                        out.push(ev);
                    }
                }
                PhotonMessage::Response {
                    operation_code,
                    parameters,
                    ..
                } => {
                    if let Some(ev) = self.handle_operation(operation_code, &parameters) {
                        out.push(ev);
                    }
                }
            }
        }
        out
    }

    fn handle_event(
        &mut self,
        code: i64,
        p: &BTreeMap<u8, PhotonValue>,
    ) -> Option<SessionEvent> {
        if let Some(ev) = self.try_loot(p) {
            return Some(ev);
        }
        if let Some(ev) = self.try_character(p) {
            return Some(ev);
        }
        if let Some(ev) = self.try_cluster(p) {
            return Some(ev);
        }
        if let Some(ev) = self.try_death(code, p) {
            return Some(ev);
        }
        if let Some(ev) = self.try_trade(p) {
            return Some(ev);
        }
        if let Some(ev) = self.try_storage(code, p) {
            return Some(ev);
        }
        if let Some(ev) = self.try_new_loot_bag(p) {
            return Some(ev);
        }
        None
    }

    fn handle_operation(
        &mut self,
        _op: u8,
        p: &BTreeMap<u8, PhotonValue>,
    ) -> Option<SessionEvent> {
        if let Some(ev) = self.try_cluster(p) {
            return Some(ev);
        }
        self.try_trade(p)
    }

    fn try_loot(&self, p: &BTreeMap<u8, PhotonValue>) -> Option<SessionEvent> {
        let layouts: [(u8, u8, u8, u8, u8); 3] = [
            (1, 2, 3, 4, 5),
            (0, 1, 2, 3, 4),
            (2, 3, 4, 5, 6),
        ];
        for (from_k, by_k, silver_k, id_k, qty_k) in layouts {
            if let Some(ev) = self.parse_loot_layout(p, from_k, by_k, silver_k, id_k, qty_k) {
                return Some(ev);
            }
        }
        None
    }

    fn parse_loot_layout(
        &self,
        p: &BTreeMap<u8, PhotonValue>,
        from_k: u8,
        by_k: u8,
        silver_k: u8,
        id_k: u8,
        qty_k: u8,
    ) -> Option<SessionEvent> {
        let is_silver = p.get(&silver_k).and_then(PhotonValue::as_bool).unwrap_or(false);
        let looted_by = p.get(&by_k).and_then(PhotonValue::as_str)?.to_string();
        if looted_by.is_empty() || !looks_like_player_name(&looted_by) {
            return None;
        }
        let mut looted_from = p
            .get(&from_k)
            .and_then(PhotonValue::as_str)
            .unwrap_or("")
            .to_string();
        if looted_from.is_empty() {
            looted_from = if is_silver {
                String::new()
            } else {
                "cadáver".into()
            };
        }
        let quantity = p.get(&qty_k).and_then(PhotonValue::as_i64)? as i32;
        if quantity <= 0 || quantity > 50_000 {
            return None;
        }
        let item_num_id = p.get(&id_k).and_then(PhotonValue::as_i64).unwrap_or(0) as i32;
        if !is_silver && item_num_id <= 0 {
            return None;
        }

        let enchant_param = p
            .get(&6)
            .or_else(|| p.get(&8))
            .and_then(PhotonValue::as_i64)
            .unwrap_or(0) as i32;

        let (mut item_unique_name, item_name, mut enchantment) = if is_silver {
            ("SILVER".into(), "Silver".into(), 0)
        } else {
            self.resolve_item(item_num_id)
        };
        if enchant_param > 0 {
            enchantment = enchant_param;
        }
        if enchantment > 0 && !item_unique_name.contains('@') && item_unique_name != "SILVER" {
            item_unique_name = format!("{item_unique_name}@{enchantment}");
        }

        let guild = self
            .players_by_name
            .get(&looted_by)
            .and_then(|pl| pl.guild.clone());

        Some(SessionEvent::Loot(LootEvent {
            id: Uuid::new_v4().to_string(),
            timestamp: now_ms(),
            looted_by,
            looted_from,
            item_num_id,
            item_unique_name,
            item_name,
            quantity,
            enchantment,
            quality: 0,
            estimated_silver: 0,
            is_silver,
            map: self.current_map.clone(),
            guild,
        }))
    }

    fn try_character(&mut self, p: &BTreeMap<u8, PhotonValue>) -> Option<SessionEvent> {
        let name = p.get(&1).and_then(PhotonValue::as_str)?.to_string();
        if !looks_like_player_name(&name) {
            return None;
        }
        // NewCharacter typically has an object id in param 0 and a guild string in 8.
        let object_id = p.get(&0).and_then(PhotonValue::as_i64).map(|v| v as i32);
        let guild = p
            .get(&8)
            .and_then(PhotonValue::as_str)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        let alliance = p
            .get(&51)
            .and_then(PhotonValue::as_str)
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());

        // Require at least guild or object id so we don't treat loot names as characters.
        if object_id.is_none() && guild.is_none() {
            return None;
        }

        let info = PlayerInfo {
            name: name.clone(),
            guild,
            alliance,
            object_id,
        };
        self.players_by_name.insert(name, info.clone());
        if let Some(id) = object_id {
            self.players_by_id.insert(id, info.clone());
        }
        Some(SessionEvent::Player(info))
    }

    fn try_cluster(&mut self, p: &BTreeMap<u8, PhotonValue>) -> Option<SessionEvent> {
        let map = ["0", "1", "255"]
            .iter()
            .filter_map(|k| {
                let id: u8 = k.parse().ok()?;
                p.get(&id).and_then(PhotonValue::as_str)
            })
            .find(|s| looks_like_map(s))
            .or_else(|| {
                p.values()
                    .filter_map(PhotonValue::as_str)
                    .find(|s| looks_like_map(s))
            })?
            .to_string();

        self.current_map = Some(map.clone());
        Some(SessionEvent::Cluster(ClusterInfo {
            map,
            timestamp: now_ms(),
        }))
    }

    fn try_death(&self, code: i64, p: &BTreeMap<u8, PhotonValue>) -> Option<SessionEvent> {
        // Death events vary; accept known-ish codes or a victim name + item array.
        let victim = p
            .get(&0)
            .and_then(|v| match v {
                PhotonValue::String(s) => Some(s.clone()),
                PhotonValue::Number(id) => self
                    .players_by_id
                    .get(&(*id as i32))
                    .map(|p| p.name.clone()),
                _ => None,
            })
            .or_else(|| p.get(&1).and_then(PhotonValue::as_str).map(|s| s.to_string()))?;

        if !looks_like_player_name(&victim) {
            return None;
        }

        let looks_death = code == 1
            || (140..=180).contains(&code)
            || p.get(&2).and_then(PhotonValue::as_str).is_some();
        if !looks_death && p.get(&3).is_none() {
            return None;
        }

        let killer = p
            .get(&2)
            .and_then(PhotonValue::as_str)
            .filter(|s| looks_like_player_name(s))
            .map(|s| s.to_string());

        let lost_items = extract_item_list(p);

        if killer.is_none() && lost_items.is_empty() && !(140..=180).contains(&code) {
            return None;
        }

        let guild = self
            .players_by_name
            .get(&victim)
            .and_then(|p| p.guild.clone());

        Some(SessionEvent::Death(DeathEvent {
            id: Uuid::new_v4().to_string(),
            timestamp: now_ms(),
            victim,
            killer,
            guild,
            map: self.current_map.clone(),
            lost_items,
        }))
    }

    fn try_trade(&self, p: &BTreeMap<u8, PhotonValue>) -> Option<SessionEvent> {
        let from = p.get(&1).and_then(PhotonValue::as_str)?.to_string();
        let to = p.get(&2).and_then(PhotonValue::as_str)?.to_string();
        if from == to || !looks_like_player_name(&from) || !looks_like_player_name(&to) {
            return None;
        }
        // Trades usually include an item id + qty and NOT the loot-from-corpse silver flag layout.
        if p.get(&3).and_then(PhotonValue::as_bool).is_some() && p.get(&5).is_some() {
            return None;
        }
        let item_num_id = p.get(&3).and_then(PhotonValue::as_i64).unwrap_or(0) as i32;
        let quantity = p.get(&4).and_then(PhotonValue::as_i64).unwrap_or(0) as i32;
        if item_num_id <= 0 || quantity <= 0 {
            return None;
        }
        let (item_unique_name, item_name, enchantment) = self.resolve_item(item_num_id);
        Some(SessionEvent::Trade(TradeEvent {
            id: Uuid::new_v4().to_string(),
            timestamp: now_ms(),
            from_player: from,
            to_player: to,
            item_name,
            item_unique_name,
            quantity,
            enchantment,
            estimated_silver: 0,
        }))
    }

    fn try_storage(&self, _code: i64, p: &BTreeMap<u8, PhotonValue>) -> Option<SessionEvent> {
        let object_id = p.get(&0).and_then(PhotonValue::as_i64)? as i32;
        let owner = self.loot_owners.get(&object_id)?.clone();
        let (item_unique_name, item_name, _enc) = self
            .item_names
            .get(&object_id)
            .cloned()
            .unwrap_or_else(|| ("UNKNOWN".into(), format!("Item #{object_id}"), 0));
        Some(SessionEvent::Storage(StorageLog {
            id: Uuid::new_v4().to_string(),
            timestamp: now_ms(),
            player: owner,
            action: "looted".into(),
            item_name,
            item_unique_name,
            quantity: 1,
            container: Some("loot-bag".into()),
        }))
    }

    fn try_new_loot_bag(&mut self, p: &BTreeMap<u8, PhotonValue>) -> Option<SessionEvent> {
        let object_id = p.get(&0).and_then(PhotonValue::as_i64)? as i32;
        let owner = p
            .get(&3)
            .and_then(PhotonValue::as_str)
            .or_else(|| p.get(&1).and_then(PhotonValue::as_str))?;
        if !looks_like_player_name(owner) {
            return None;
        }
        self.loot_owners.insert(object_id, owner.to_string());
        None
    }

    fn resolve_item(&self, item_num_id: i32) -> (String, String, i32) {
        self.item_names
            .get(&item_num_id)
            .cloned()
            .unwrap_or_else(|| {
                (
                    format!("ITEM_{item_num_id}"),
                    format!("Item #{item_num_id}"),
                    enchant_from_id(item_num_id),
                )
            })
    }
}

fn extract_item_list(p: &BTreeMap<u8, PhotonValue>) -> Vec<LostItem> {
    let mut items = Vec::new();
    for value in p.values() {
        if let PhotonValue::Array(arr) = value {
            for entry in arr {
                match entry {
                    PhotonValue::String(name) if !name.is_empty() => items.push(LostItem {
                        item_name: name.clone(),
                        item_unique_name: name.clone(),
                        quantity: 1,
                        enchantment: 0,
                        estimated_silver: 0,
                    }),
                    PhotonValue::Number(n) if *n > 0 => items.push(LostItem {
                        item_name: format!("Item #{n}"),
                        item_unique_name: format!("ITEM_{n}"),
                        quantity: 1,
                        enchantment: 0,
                        estimated_silver: 0,
                    }),
                    _ => {}
                }
            }
        }
    }
    items.truncate(32);
    items
}

fn looks_like_player_name(s: &str) -> bool {
    let t = s.trim();
    if t.len() < 3 || t.len() > 24 {
        return false;
    }
    t.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        && t.chars().any(|c| c.is_ascii_alphabetic())
}

fn looks_like_map(s: &str) -> bool {
    let t = s.trim();
    if t.len() < 3 || t.len() > 80 {
        return false;
    }
    let lower = t.to_ascii_lowercase();
    const MARKERS: &[&str] = &[
        "cluster",
        "black",
        "outlands",
        "roads",
        "mists",
        "tnl",
        "rnd",
        "portal",
        "city",
        "ciudad",
        "hideout",
        "island",
        "bridgewatch",
        "martlock",
        "thetford",
        "lymhurst",
        "sterling",
        "caerleon",
        "brecilien",
        "steppe",
        "highland",
        "forest",
        "mountain",
        "swamp",
        "yellow",
        "red zone",
        "gvg",
        "hellgate",
        "corrupted",
        "avalon",
    ];
    if MARKERS.iter().any(|m| lower.contains(m)) {
        return true;
    }
    if t.contains('@') || (t.contains('-') && t.len() >= 5) {
        return true;
    }
    t.chars().all(|c| c.is_ascii_digit()) && t.len() >= 4
}

fn enchant_from_id(_id: i32) -> i32 {
    0
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
