/// Check npm registry for latest version of a package
pub async fn check_npm_version(package_name: &str) -> Result<String, String> {
    let url = format!("https://registry.npmjs.org/{}/latest", package_name);
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    data.get("version")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| "Version not found".to_string())
}
