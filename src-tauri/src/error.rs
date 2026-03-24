use serde::{ser::Serializer, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("Encryption error: {0}")]
    Encryption(String),
    #[error("Internal error: {0}")]
    Internal(String),
    #[error("{0}")]
    Message(String),
}

// Implement Serialize so it can be returned from Tauri commands automatically
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

impl From<String> for AppError {
    fn from(err: String) -> Self {
        AppError::Message(err)
    }
}

impl From<&str> for AppError {
    fn from(err: &str) -> Self {
        AppError::Message(err.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
