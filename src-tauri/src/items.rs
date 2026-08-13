use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};

const ITEMS_URL: &str =
    "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json";

#[derive(Debug, Deserialize)]
struct ItemRow {
    #[serde(rename = "UniqueName")]
    unique_name: Option<String>,
    #[serde(rename = "Index")]
    index: Option<serde_json::Value>,
    #[serde(rename = "LocalizedNames")]
    localized: Option<HashMap<String, String>>,
}

/// itemNumId -> (uniqueName, displayName, enchantment)
pub fn load_catalog() -> BTreeMap<i32, (String, String, i32)> {
    let mut out = BTreeMap::new();
    let Ok(client) = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .build()
    else {
        return out;
    };
    let Ok(resp) = client.get(ITEMS_URL).send() else {
        return out;
    };
    let Ok(rows) = resp.json::<Vec<ItemRow>>() else {
        return out;
    };
    for (i, row) in rows.into_iter().enumerate() {
        let Some(unique) = row.unique_name.filter(|s| !s.is_empty()) else {
            continue;
        };
        let (base, enc) = split_enchant(&unique);
        let name = row
            .localized
            .as_ref()
            .and_then(|m| {
                m.get("ES-ES")
                    .or_else(|| m.get("EN-US"))
                    .or_else(|| m.values().next())
            })
            .cloned()
            .unwrap_or_else(|| pretty_name(&base));
        let entry = (unique, name, enc);
        if let Some(idx) = parse_index(&row.index) {
            out.insert(idx, entry.clone());
        }
        out.entry(i as i32).or_insert(entry);
    }
    out
}

fn parse_index(v: &Option<serde_json::Value>) -> Option<i32> {
    match v {
        Some(serde_json::Value::Number(n)) => n.as_i64().map(|x| x as i32),
        Some(serde_json::Value::String(s)) => s.parse().ok(),
        _ => None,
    }
}

pub fn split_enchant(unique: &str) -> (String, i32) {
    if let Some((base, enc)) = unique.rsplit_once('@') {
        if let Ok(n) = enc.parse::<i32>() {
            return (base.to_string(), n);
        }
    }
    (unique.to_string(), 0)
}

fn pretty_name(unique: &str) -> String {
    unique
        .split('_')
        .skip_while(|p| (p.len() <= 2 && p.starts_with('T')) || *p == "2H" || *p == "1H")
        .map(|p| {
            let mut c = p.chars();
            match c.next() {
                Some(f) => format!("{}{}", f.to_uppercase(), c.as_str().to_lowercase()),
                None => String::new(),
            }
        })
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}
