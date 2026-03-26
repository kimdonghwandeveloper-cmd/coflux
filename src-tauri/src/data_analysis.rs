use polars::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CsvSummary {
    pub columns: Vec<String>,
    pub row_count: usize,
    pub sample_data: Vec<HashMap<String, serde_json::Value>>,
    pub column_types: HashMap<String, String>,
}

#[tauri::command]
pub fn coflux_analyze_csv(path: String) -> Result<CsvSummary, String> {
    let df = CsvReadOptions::default()
        .with_has_header(true)
        .with_infer_schema_length(Some(100))
        .try_into_reader_with_file_path(Some(path.into()))
        .map_err(|e| e.to_string())?
        .finish()
        .map_err(|e| format!("Failed to parse CSV: {}", e))?;

    let columns = df.get_column_names().iter().map(|s| s.to_string()).collect();
    let row_count = df.height();
    
    // Get column types
    let mut column_types = HashMap::new();
    for series in df.get_columns() {
        column_types.insert(series.name().to_string(), format!("{:?}", series.dtype()));
    }

    // Extract sample data (first 10 rows)
    let sample_df = df.head(Some(10));
    let mut sample_data = Vec::new();
    
    for i in 0..sample_df.height() {
        let mut row = HashMap::new();
        for series in sample_df.get_columns() {
            let val = series.get(i).map_err(|e| e.to_string())?;
            let json_val = match val {
                AnyValue::Int32(v) => serde_json::json!(v),
                AnyValue::Int64(v) => serde_json::json!(v),
                AnyValue::Float32(v) => serde_json::json!(v),
                AnyValue::Float64(v) => serde_json::json!(v),
                AnyValue::String(v) => serde_json::json!(v),
                AnyValue::Boolean(v) => serde_json::json!(v),
                AnyValue::Null => serde_json::json!(null),
                _ => serde_json::json!(format!("{:?}", val)),
            };
            row.insert(series.name().to_string(), json_val);
        }
        sample_data.push(row);
    }

    Ok(CsvSummary {
        columns,
        row_count,
        sample_data,
        column_types,
    })
}
