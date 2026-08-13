use std::collections::BTreeMap;

const EMBEDDED_ITEMS: &str = include_str!("../data/items-min.json");

/// itemNumId -> (uniqueName, displayName, enchantment)
pub fn load_catalog() -> BTreeMap<i32, (String, String, i32)> {
    from_minified(EMBEDDED_ITEMS)
}

fn from_minified(text: &str) -> BTreeMap<i32, (String, String, i32)> {
    let Ok(map) = serde_json::from_str::<BTreeMap<String, (String, String)>>(text) else {
        return BTreeMap::new();
    };
    let mut out = BTreeMap::new();
    for (k, (unique, name)) in map {
        let Ok(idx) = k.parse::<i32>() else {
            continue;
        };
        let enc = split_enchant(&unique).1;
        out.insert(idx, (unique, name, enc));
    }
    out
}

fn split_enchant(unique: &str) -> (String, i32) {
    if let Some((base, enc)) = unique.rsplit_once('@') {
        if let Ok(n) = enc.parse::<i32>() {
            return (base.to_string(), n);
        }
    }
    (unique.to_string(), 0)
}

pub fn lookup(
    catalog: &BTreeMap<i32, (String, String, i32)>,
    item_num_id: i32,
) -> Option<(String, String, i32)> {
    if item_num_id <= 0 {
        return None;
    }
    if let Some(hit) = catalog.get(&item_num_id) {
        return Some(hit.clone());
    }
    let masked = item_num_id & 0xFFFF;
    if masked > 0 && masked != item_num_id {
        if let Some(hit) = catalog.get(&masked) {
            return Some(hit.clone());
        }
    }
    None
}
