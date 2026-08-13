use crate::models::PriceQuote;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
struct AodpPrice {
    #[serde(rename = "item_id")]
    item_id: String,
    city: String,
    #[serde(rename = "sell_price_min")]
    sell_price_min: i64,
}

pub async fn fetch_prices(unique_names: Vec<String>) -> Result<Vec<PriceQuote>, String> {
    if unique_names.is_empty() {
        return Ok(Vec::new());
    }
    let mut best: HashMap<String, PriceQuote> = HashMap::new();
    for chunk in unique_names.chunks(80) {
        let joined = chunk.join(",");
        let url = format!(
            "https://west.albion-online-data.com/api/v2/stats/prices/{joined}?locations=Black%20Market,Bridgewatch,Martlock,Thetford,Lymhurst,Fort%20Sterling,Caerleon"
        );
        let rows: Vec<AodpPrice> = reqwest::Client::new()
            .get(&url)
            .timeout(std::time::Duration::from_secs(12))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        for row in rows {
            if row.sell_price_min <= 0 {
                continue;
            }
            best.entry(row.item_id.clone())
                .and_modify(|q| {
                    if row.sell_price_min < q.sell_price {
                        q.sell_price = row.sell_price_min;
                        q.location = row.city.clone();
                    }
                })
                .or_insert(PriceQuote {
                    unique_name: row.item_id,
                    sell_price: row.sell_price_min,
                    location: row.city,
                });
        }
    }
    Ok(best.into_values().collect())
}
