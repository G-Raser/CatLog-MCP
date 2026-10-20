[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
function Get-CatLogConfigPath {
  if ($env:CATLOG_MCP_CONFIG) { return $env:CATLOG_MCP_CONFIG }
  if ($env:CATLOG_MCP_STATE_DIR) { return (Join-Path $env:CATLOG_MCP_STATE_DIR "config.json") }
  if ($env:LOCALAPPDATA) { return (Join-Path $env:LOCALAPPDATA "CatLogMCP\config.json") }
  return (Join-Path $HOME ".catlog-mcp\config.json")
}
Push-Location $project
try {
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed: $LASTEXITCODE" }
  $configPath = Get-CatLogConfigPath
  $stateDir = Split-Path -Parent $configPath
  New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
  if (-not (Test-Path -LiteralPath $configPath)) {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $secret = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
    $configJson = [ordered]@{
      port = 32188
      bind_host = "127.0.0.1"
      mcp_path = "/mcp-$secret"
      companion_url = "http://127.0.0.1:43129"
    } | ConvertTo-Json
    [IO.File]::WriteAllText($configPath, $configJson, [Text.UTF8Encoding]::new($false))
  }
  Write-Host "CatLog MCP is ready." -ForegroundColor Green
  Write-Host "Config: $configPath"
} finally {
  Pop-Location
}
