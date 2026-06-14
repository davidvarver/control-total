$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$secretPath = Join-Path $root ".cron-secret.local"
$logDir = Join-Path $root "data"
$logPath = Join-Path $logDir "local-cron.log"

if (!(Test-Path $secretPath)) {
  throw "Missing .cron-secret.local"
}

if (!(Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$secret = (Get-Content $secretPath -Raw).Trim()
$headers = @{ Authorization = "Bearer $secret" }
$startedAt = Get-Date -Format o

try {
  $response = Invoke-RestMethod `
    -Uri "https://control-total-phi.vercel.app/api/cron/meli-hourly" `
    -Headers $headers `
    -Method Get `
    -TimeoutSec 90

  $result = @{
    startedAt = $startedAt
    ok = $response.ok
    runtimeMs = $response.runtimeMs
    syncedAt = $response.syncedAt
    accounts = $response.accounts
    results = $response.results
  } | ConvertTo-Json -Depth 8 -Compress

  Add-Content -Path $logPath -Value $result
} catch {
  $errorResult = @{
    startedAt = $startedAt
    ok = $false
    error = $_.Exception.Message
  } | ConvertTo-Json -Compress

  Add-Content -Path $logPath -Value $errorResult
  throw
}
