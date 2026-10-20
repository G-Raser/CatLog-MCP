[CmdletBinding()]
param(
  [string]$TaskName = "CatLog MCP"
)
$ErrorActionPreference = "Stop"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Write-Host "Scheduled task '$TaskName' removed."
