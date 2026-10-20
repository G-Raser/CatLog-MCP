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
$configPath = Get-CatLogConfigPath
if (-not (Test-Path -LiteralPath $configPath)) { & (Join-Path $project "setup.ps1") }
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$bindHost = if ($config.bind_host) { [string]$config.bind_host } else { "127.0.0.1" }
& node (Join-Path $project "server.mjs") --port ([string]$config.port) --bind-host $bindHost --mcp-path ([string]$config.mcp_path) --companion-url ([string]$config.companion_url)
exit $LASTEXITCODE
