param([int]$Port = 8877, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCommand) { throw 'Python 3.10+ is required. Install Python and enable Add to PATH.' }
$serverPath = Join-Path $projectRoot 'server.py'
$dataPath = Join-Path $projectRoot 'data'
New-Item -ItemType Directory -Path $dataPath -Force | Out-Null
$localUrl = "http://127.0.0.1:$Port"
try {
    $health = Invoke-RestMethod "$localUrl/api/health" -TimeoutSec 2
    if ($health.ok -and $health.mode -eq 'local-demo') {
        Write-Host "Yilian is running: $localUrl"
        if (-not $NoBrowser) { Start-Process $localUrl }
        exit 0
    }
} catch { }
$process = Start-Process -FilePath $pythonCommand.Source -ArgumentList @('"' + $serverPath + '"', '--port', $Port) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataPath 'server.log') -RedirectStandardError (Join-Path $dataPath 'server-error.log') -PassThru
$process.Id | Set-Content -LiteralPath (Join-Path $dataPath 'server.pid')
for ($attempt=0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 300
    if ($process.HasExited) { throw "Server failed to start. Check data/server-error.log. Port $Port may be occupied." }
    try {
        $health = Invoke-RestMethod "$localUrl/api/health" -TimeoutSec 1
        if ($health.ok -and $health.mode -eq 'local-demo') {
            Write-Host "Yilian started: $localUrl"
            if (-not $NoBrowser) { Start-Process $localUrl }
            exit 0
        }
    } catch { }
}
throw 'Startup timed out. Check data/server-error.log.'
