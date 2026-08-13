//! Cluster index → display name from ao-bin-dumps `world.json`.
//! Albion sends `1311` on the wire, not `"Watchwood Precipice"`.

use serde::Deserialize;
use std::collections::HashMap;

const WORLD_URL: &str =
    "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/world.json";
const EMBEDDED_WORLD: &str = include_str!("../data/world.json");

#[derive(Debug, Deserialize)]
struct ClusterRow {
    #[serde(rename = "Index")]
    index: Option<String>,
    #[serde(rename = "UniqueName")]
    unique_name: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ClusterBook {
    /// lowercase index or unique name → display name
    by_key: HashMap<String, String>,
}

impl ClusterBook {
    pub fn load() -> Self {
        let mut book = Self::from_json(EMBEDDED_WORLD);
        if let Ok(client) = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(12))
            .build()
        {
            if let Ok(resp) = client.get(WORLD_URL).send() {
                if let Ok(text) = resp.text() {
                    let fresh = Self::from_json(&text);
                    if fresh.len() >= book.len() {
                        book = fresh;
                    }
                }
            }
        }
        book
    }

    fn from_json(text: &str) -> Self {
        let mut book = Self::with_city_fallbacks();
        let Ok(rows) = serde_json::from_str::<Vec<ClusterRow>>(text) else {
            return book;
        };
        for row in rows {
            let Some(display) = row
                .unique_name
                .as_ref()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("debug"))
                .map(|s| s.to_string())
            else {
                continue;
            };
            if let Some(idx) = row.index.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
                book.insert(idx, &display);
            }
            book.insert(&display, &display);
        }
        book
    }

    fn with_city_fallbacks() -> Self {
        let mut book = Self::default();
        const CITIES: &[(&str, &str)] = &[
            ("1000", "Lymhurst"),
            ("2000", "Bridgewatch"),
            ("3004", "Martlock"),
            ("0000", "Thetford"),
            ("0", "Thetford"),
            ("4000", "Fort Sterling"),
            ("3003", "Caerleon"),
            ("5000", "Brecilien"),
            ("5001", "Brecilien"),
            ("1311", "Watchwood Precipice"),
            ("1012", "Merlyn's Rest"),
            ("0301", "Thetford Portal"),
            ("1301", "Lymhurst Portal"),
            ("2301", "Bridgewatch Portal"),
            ("3301", "Martlock Portal"),
            ("4301", "Fort Sterling Portal"),
        ];
        for (idx, name) in CITIES {
            book.insert(idx, name);
            book.insert(name, name);
        }
        book
    }

    fn insert(&mut self, key: &str, display: &str) {
        self.by_key
            .insert(key.trim().to_ascii_lowercase(), display.to_string());
    }

    pub fn len(&self) -> usize {
        self.by_key.len()
    }

    pub fn resolve(&self, raw: &str) -> Option<String> {
        let t = raw.trim();
        if t.is_empty() || t.len() > 120 {
            return None;
        }
        if t.contains('@') {
            for part in t.split('@').filter(|p| !p.is_empty()) {
                if let Some(name) = self.resolve_one(part) {
                    return Some(name);
                }
            }
            return None;
        }
        self.resolve_one(t)
    }

    fn resolve_one(&self, t: &str) -> Option<String> {
        let key = t.to_ascii_lowercase();
        if let Some(name) = self.by_key.get(&key) {
            return Some(name.clone());
        }
        if let Ok(n) = t.parse::<i64>() {
            return self.resolve_number(n);
        }
        None
    }

    pub fn resolve_number(&self, n: i64) -> Option<String> {
        if n <= 0 {
            return None;
        }
        let plain = n.to_string();
        if let Some(name) = self.by_key.get(&plain) {
            return Some(name.clone());
        }
        if n <= 9999 {
            let padded = format!("{n:04}");
            if let Some(name) = self.by_key.get(&padded) {
                return Some(name.clone());
            }
        }
        None
    }

    pub fn resolve_fuzzy(&self, raw: &str) -> Option<String> {
        if let Some(exact) = self.resolve(raw) {
            return Some(exact);
        }
        let lower = raw.to_ascii_lowercase();
        const CITIES: &[&str] = &[
            "lymhurst",
            "bridgewatch",
            "martlock",
            "thetford",
            "fort sterling",
            "caerleon",
            "brecilien",
            "watchwood",
        ];
        for city in CITIES {
            if lower == *city
                || lower.starts_with(&format!("{city} "))
                || lower.contains(&format!(" {city}"))
            {
                if let Some(name) = self.by_key.get(*city) {
                    return Some(name.clone());
                }
                if *city == "watchwood" {
                    return Some("Watchwood Precipice".into());
                }
            }
        }
        None
    }
}
