$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'data/server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'No saved server process.'; exit 0 }
$serverProcessId = [int](Get-Content -LiteralPath $pidFile)
$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $serverProcessId" -ErrorAction SilentlyContinue
$expectedScript = Join-Path $PSScriptRoot 'server.py'
if ($serverProcess -and $serverProcess.Name -match '^python(w)?\.exe$' -and $serverProcess.CommandLine.Contains($expectedScript)) {
    Stop-Process -Id $serverProcessId
    Remove-Item -LiteralPath $pidFile
    Write-Host 'Yilian local server stopped. Saved data is retained.'
} else { Write-Host 'Saved process is absent or belongs to another application; no process stopped.' }
