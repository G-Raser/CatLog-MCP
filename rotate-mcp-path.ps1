[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$ShowNewPath
)
$ErrorActionPreference = "Stop"
function Get-CatLogConfigPath {
  if ($env:CATLOG_MCP_CONFIG) { return $env:CATLOG_MCP_CONFIG }
  if ($env:CATLOG_MCP_STATE_DIR) { return (Join-Path $env:CATLOG_MCP_STATE_DIR "config.json") }
  if ($env:LOCALAPPDATA) { return (Join-Path $env:LOCALAPPDATA "CatLogMCP\config.json") }
  return (Join-Path $HOME ".catlog-mcp\config.json")
}
function New-CapabilityPath {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  $secret = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
  return "/mcp-$secret"
}
$configPath = Get-CatLogConfigPath
if (-not (Test-Path -LiteralPath $configPath)) {
  throw "CatLog MCP config not found: $configPath"
}
$raw = [IO.File]::ReadAllText($configPath, [Text.Encoding]::UTF8)
try { $config = $raw | ConvertFrom-Json } catch { throw "CatLog MCP config is not valid JSON: $configPath" }
$newPath = New-CapabilityPath
if ($newPath.Length -lt 45 -or $newPath -notmatch '^/mcp-[A-Za-z0-9_-]{40,}$') {
  throw "Generated MCP capability path did not meet the required shape"
}
if ($PSCmdlet.ShouldProcess($configPath, "rotate CatLog MCP capability path")) {
  if ($config.PSObject.Properties.Name -contains "mcp_path") {
    $config.mcp_path = $newPath
  } else {
    $config | Add-Member -NotePropertyName mcp_path -NotePropertyValue $newPath
  }
  $json = $config | ConvertTo-Json -Depth 20
  $tempPath = "$configPath.tmp"
  [IO.File]::WriteAllText($tempPath, $json, [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $tempPath -Destination $configPath -Force
  Write-Host "CatLog MCP capability path rotated." -ForegroundColor Green
  Write-Host "Config: $configPath"
  Write-Host "New path length: $($newPath.Length)"
  Write-Host "Next: restart CatLog MCP, delete the old ChatGPT CatLog connection, then reconnect with the new endpoint."
  if ($ShowNewPath) {
    Write-Warning "The following path is a credential. Do not paste it into public logs, issues, screenshots, or documentation."
    Write-Output $newPath
  } else {
    Write-Host "Run again with -ShowNewPath only when you are ready to reconnect the client."
  }
}
