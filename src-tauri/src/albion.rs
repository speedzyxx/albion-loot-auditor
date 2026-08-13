//! Maps decoded Photon messages onto typed Albion session events.
//!
//! Event numeric codes change every Albion patch. We combine:
//!   1. Configurable code lists (easy to update)
//!   2. Parameter-signature heuristics used by community loot loggers
//!
//! Game events typically arrive as Photon eventCode=1 with the real code in
//! parameter 252.

use crate::models::{
    BuildInfo, ClusterInfo, CombatHit, DeathEvent, GearPiece, LootEvent, LostItem, PlayerInfo,
    StorageLog, TradeEvent,
};
use crate::photon::{PhotonMessage, PhotonValue};
use crate::world::ClusterBook;
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
    Damage(CombatHit),
    Heal(CombatHit),
    Build(BuildInfo),
}

#[derive(Default)]
pub struct SessionWorld {
    pub players_by_id: BTreeMap<i32, PlayerInfo>,
    pub players_by_name: BTreeMap<String, PlayerInfo>,
    pub current_map: Option<String>,
    pub local_name: Option<String>,
    pub local_id: Option<i32>,
    /// objectId -> pending loot bag owner
    pub loot_owners: BTreeMap<i32, String>,
    pub item_names: BTreeMap<i32, (String, String, i32)>,
    pub last_health: BTreeMap<i32, i64>,
    pub clusters: ClusterBook,
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
                    if let Some(ev) = self.try_combat_hit(&parameters) {
                        out.push(ev);
                    } else if let Some(ev) = self.try_health(&parameters) {
                        out.push(ev);
                    }
                    if let Some(ev) = self.try_build(&parameters) {
                        out.push(ev);
                    }
                }
                PhotonMessage::Request {
                    operation_code,
                    parameters,
                } => {
                    let op = parameters
                        .get(&253)
                        .and_then(PhotonValue::as_i64)
                        .unwrap_or(operation_code as i64);
                    out.extend(self.handle_operation(op, &parameters));
                }
                PhotonMessage::Response {
                    operation_code,
                    parameters,
                    ..
                } => {
                    let op = parameters
                        .get(&253)
                        .and_then(PhotonValue::as_i64)
                        .unwrap_or(operation_code as i64);
                    out.extend(self.handle_operation(op, &parameters));
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
        op: i64,
        p: &BTreeMap<u8, PhotonValue>,
    ) -> Vec<SessionEvent> {
        let mut out = Vec::new();
        if let Some(ev) = self.try_cluster(p, Some(op)) {
            out.push(ev);
        }
        if let Some(ev) = self.try_join_self(p) {
            out.push(ev);
        }
        if let Some(ev) = self.try_trade(p) {
            out.push(ev);
        }
        out
    }

    fn try_join_self(&mut self, p: &BTreeMap<u8, PhotonValue>) -> Option<SessionEvent> {
        // Albion Analytics JoinResponse: 0=objectId, 1=guid, 2=username, 8=mapId, 58=guild, 79=alliance.
        let name = p.get(&2).and_then(PhotonValue::as_str)?.to_string();
        if !looks_like_player_name(&name) {
            return None;
        }
        // Join always carries mapId at 8. Without it this is some other op with a name at 2.
        if self.cluster_from_value(p.get(&8)).is_none()
            && p.get(&8)
                .and_then(PhotonValue::as_str)
                .map(|s| s.contains('@'))
                != Some(true)
        {
            return None;
        }
        let object_id = p.get(&0).and_then(PhotonValue::as_i64).and_then(|n| {
            i32::try_from(n).ok().filter(|id| *id != 0)
        });
        let guild = p
            .get(&58)
            .or_else(|| p.get(&57))
            .and_then(PhotonValue::as_str)
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .filter(|s| self.clusters.resolve(s).is_none())
            .filter(|s| !s.chars().all(|c| c.is_ascii_digit()))
            .map(|s| s.to_string());
        let info = PlayerInfo {
            name: name.clone(),
            guild,
            alliance: p
                .get(&79)
                .or_else(|| p.get(&77))
                .and_then(PhotonValue::as_str)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            object_id,
            is_local: true,
        };
        self.local_name = Some(name.clone());
        self.local_id = object_id;
        self.players_by_name.insert(name, info.clone());
        if let Some(id) = object_id {
            self.players_by_id.insert(id, info.clone());
        }
        Some(SessionEvent::Player(info))
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
        let object_id = p.get(&0).and_then(PhotonValue::as_object_id);
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
            is_local: self.local_id.is_some() && self.local_id == object_id,
        };
        if info.is_local {
            self.players_by_name.insert(name.clone(), info.clone());
            if let Some(id) = object_id {
                self.players_by_id.insert(id, info.clone());
            }
            return Some(SessionEvent::Player(info));
        }
        self.players_by_name.insert(name, info.clone());
        if let Some(id) = object_id {
            self.players_by_id.insert(id, info.clone());
        }
        Some(SessionEvent::Player(info))
    }

    fn try_cluster(&mut self, p: &BTreeMap<u8, PhotonValue>, op: Option<i64>) -> Option<SessionEvent> {
        if p.contains_key(&252) {
            return None;
        }
        let op = op.or_else(|| p.get(&253).and_then(PhotonValue::as_i64));
        let join_shape = self.cluster_from_join(p).is_some()
            && p.get(&2)
                .and_then(PhotonValue::as_str)
                .is_some_and(looks_like_player_name);
        // Analytics: Join=2 (mapId @ 8). ChangeCluster live code is 36 (index @ 0); 35/41 are older patches.
        let (cluster_id, name) = if matches!(op, Some(2)) || join_shape {
            self.cluster_from_join(p)?
        } else if matches!(op, Some(35) | Some(36) | Some(41)) {
            self.cluster_from_change(p)?
        } else {
            return None;
        };

        let map = if name.to_ascii_lowercase().contains(&cluster_id.to_ascii_lowercase()) {
            name
        } else {
            format!("{name} ({cluster_id})")
        };
        if self.current_map.as_deref() == Some(map.as_str()) {
            return None;
        }
        self.current_map = Some(map.clone());
        self.prune_entities_keep_local();
        Some(SessionEvent::Cluster(ClusterInfo {
            map,
            cluster_id: Some(cluster_id),
            timestamp: now_ms(),
        }))
    }

    fn prune_entities_keep_local(&mut self) {
        let local_id = self.local_id;
        let local_name = self.local_name.clone();
        self.players_by_id.retain(|id, _| Some(*id) == local_id);
        self.players_by_name
            .retain(|name, _| local_name.as_deref() == Some(name.as_str()));
        self.loot_owners.clear();
        self.last_health.clear();
    }

    fn cluster_from_join(&self, p: &BTreeMap<u8, PhotonValue>) -> Option<(String, String)> {
        // Join / JoinFinished: mapId is parameter 8.
        self.cluster_from_value(p.get(&8))
            .or_else(|| {
                p.get(&8)
                    .and_then(PhotonValue::as_str)
                    .and_then(|s| self.named_instance(s))
            })
    }

    fn cluster_from_change(&self, p: &BTreeMap<u8, PhotonValue>) -> Option<(String, String)> {
        // ChangeCluster: destination index in parameter 0.
        self.cluster_from_value(p.get(&0))
    }

    fn named_instance(&self, raw: &str) -> Option<(String, String)> {
        let t = raw.trim();
        if t.is_empty() {
            return None;
        }
        let lower = t.to_ascii_lowercase();
        if lower.contains("mist") {
            return Some((t.to_string(), "Mists".into()));
        }
        if lower.contains("hideout") {
            return Some((t.to_string(), "Hideout".into()));
        }
        None
    }

    fn cluster_from_value(&self, value: Option<&PhotonValue>) -> Option<(String, String)> {
        let value = value?;
        if let Some(s) = value.as_str() {
            let id = s.split('@').next().unwrap_or(s).trim();
            let name = self.clusters.resolve(s)?;
            let label = if id.chars().all(|c| c.is_ascii_digit()) {
                id.to_string()
            } else {
                s.trim().to_string()
            };
            return Some((label, name));
        }
        if let Some(n) = value.as_i64() {
            let name = self.clusters.resolve_number(n)?;
            return Some((n.to_string(), name));
        }
        if let PhotonValue::Array(arr) = value {
            for entry in arr {
                if let Some(hit) = self.cluster_from_value(Some(entry)) {
                    return Some(hit);
                }
            }
        }
        None
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
        crate::items::lookup(&self.item_names, item_num_id).unwrap_or_else(|| {
            (
                format!("ITEM_{item_num_id}"),
                format!("Item #{item_num_id}"),
                0,
            )
        })
    }

    fn resolve_player(&self, object_id: i32) -> Option<String> {
        self.players_by_id.get(&object_id).map(|p| p.name.clone())
    }

    fn player_or_unknown(&self, object_id: i32) -> String {
        self.resolve_player(object_id)
            .unwrap_or_else(|| format!("id:{object_id}"))
    }

    fn try_combat_hit(&self, p: &BTreeMap<u8, PhotonValue>) -> Option<SessionEvent> {
        // HealthUpdate (community tools): 0=target, 2=healthChange, 3=newHealth, 6=causer
        let target_id = p.get(&0).and_then(PhotonValue::as_object_id)?;
        let delta = p
            .get(&2)
            .and_then(PhotonValue::as_f64)
            .or_else(|| p.get(&3).and_then(PhotonValue::as_f64))?;
        let new_health = p.get(&3).and_then(PhotonValue::as_f64).unwrap_or(0.0);
        if new_health != 0.0 && !(0.0..=500_000.0).contains(&new_health) {
            return None;
        }
        let causer_id = p.get(&6).and_then(PhotonValue::as_object_id).or_else(|| {
            // Some patches put the causer in 1, but only if 2 is a health-delta float.
            if matches!(p.get(&2), Some(PhotonValue::Float(_))) {
                p.get(&1).and_then(PhotonValue::as_object_id)
            } else {
                None
            }
        })?;
        let target_known = self.players_by_id.contains_key(&target_id);
        let causer_known = self.players_by_id.contains_key(&causer_id);
        let local_involved =
            self.local_id == Some(target_id) || self.local_id == Some(causer_id);
        if !target_known && !causer_known && !local_involved {
            return None;
        }
        let amount = delta.abs().round() as i64;
        if amount < 1 || amount > 2_000_000 {
            return None;
        }
        // Regen ticks without a known causer are noisy.
        if !causer_known && amount < 25 {
            return None;
        }
        if causer_id == target_id && delta < 0.0 {
            return None;
        }

        let target = self.player_or_unknown(target_id);
        let source = self.player_or_unknown(causer_id);

        let hit = CombatHit {
            id: Uuid::new_v4().to_string(),
            timestamp: now_ms(),
            source,
            target,
            amount,
            map: self.current_map.clone(),
        };
        if delta > 0.5 {
            Some(SessionEvent::Heal(hit))
        } else if delta < -0.5 {
            Some(SessionEvent::Damage(hit))
        } else {
            None
        }
    }

    fn try_health(&mut self, p: &BTreeMap<u8, PhotonValue>) -> Option<SessionEvent> {
        let id = p.get(&0).and_then(PhotonValue::as_object_id)?;
        let name = self.resolve_player(id)?;
        let health = p.get(&1).and_then(PhotonValue::as_f64)?;
        if !(0.0..=400_000.0).contains(&health) {
            return None;
        }
        let prev = self.last_health.insert(id, health.round() as i64);
        let Some(prev) = prev else {
            return None;
        };
        let delta = health.round() as i64 - prev;
        if delta <= -25 {
            Some(SessionEvent::Damage(CombatHit {
                id: Uuid::new_v4().to_string(),
                timestamp: now_ms(),
                source: "desconocido".into(),
                target: name,
                amount: -delta,
                map: self.current_map.clone(),
            }))
        } else if delta >= 25 && delta < 80_000 {
            Some(SessionEvent::Heal(CombatHit {
                id: Uuid::new_v4().to_string(),
                timestamp: now_ms(),
                source: name.clone(),
                target: name,
                amount: delta,
                map: self.current_map.clone(),
            }))
        } else {
            None
        }
    }

    fn try_build(&self, p: &BTreeMap<u8, PhotonValue>) -> Option<SessionEvent> {
        let player = p
            .get(&1)
            .and_then(PhotonValue::as_str)
            .map(|s| s.to_string())
            .or_else(|| {
                p.get(&0)
                    .and_then(PhotonValue::as_object_id)
                    .and_then(|id| self.resolve_player(id))
            })?;
        if !looks_like_player_name(&player) {
            return None;
        }
        let mut items = Vec::new();
        let mut seen = std::collections::HashSet::new();
        let mut push_id = |id: i64, world: &SessionWorld, items: &mut Vec<GearPiece>| {
            if id <= 50 || !seen.insert(id) {
                return;
            }
            let (unique, name, enc) = world.resolve_item(id as i32);
            if unique.starts_with("ITEM_") {
                return;
            }
            items.push(GearPiece {
                item_name: name,
                item_unique_name: unique,
                enchantment: enc,
            });
        };

        for key in [33u8, 38, 39, 40, 41, 42] {
            if let Some(PhotonValue::Array(arr)) = p.get(&key) {
                for entry in arr {
                    if let Some(id) = entry.as_i64() {
                        push_id(id, self, &mut items);
                    }
                }
            }
        }
        for value in p.values() {
            if let PhotonValue::Array(arr) = value {
                if arr.len() < 3 || arr.len() > 16 {
                    continue;
                }
                let ids: Vec<i64> = arr.iter().filter_map(PhotonValue::as_i64).collect();
                if ids.len() < 3 {
                    continue;
                }
                for id in ids {
                    push_id(id, self, &mut items);
                }
            }
        }
        for k in 7u8..=28 {
            if let Some(id) = p.get(&k).and_then(PhotonValue::as_i64) {
                push_id(id, self, &mut items);
            }
        }
        items.truncate(12);
        if items.len() < 3 {
            return None;
        }
        let guild = self
            .players_by_name
            .get(&player)
            .and_then(|pl| pl.guild.clone());
        Some(SessionEvent::Build(BuildInfo {
            player,
            guild,
            items,
            timestamp: now_ms(),
        }))
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

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
