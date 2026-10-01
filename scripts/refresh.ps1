# Refresh the Afeka data on this PC and push it (GitHub Pages deploys web/ on push).
# Windows PowerShell 5.1. Run from anywhere; log: scripts\refresh.log (git-ignored).
#
# Register once, as the current user, no stored password (runs only while logged on; a missed run starts when
# the PC is next available; runs on battery):
#
#   $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "E:\lets_learn\scripts\refresh.ps1"'
#   $t = New-ScheduledTaskTrigger -Daily -At 00:17
#   $s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
#   $p = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
#   Register-ScheduledTask -TaskName 'afeka-refresh' -Action $a -Trigger $t -Settings $s -Principal $p
#
# (Fix the path to wherever the repo lives. git push needs cached credentials on this PC.)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$log = 'scripts\refresh.log'
$out = [IO.Path]::GetTempFileName(); $err = [IO.Path]::GetTempFileName()
$node = if ($env:REFRESH_NODE) { $env:REFRESH_NODE } else { 'node' } # override only for tests

function Log($m) { Add-Content $log "$(Get-Date -Format s) $m" }

git pull --ff-only
if ($LASTEXITCODE) { Log 'git pull failed'; exit 1 }

# stdout = one summary line, stderr = progress. A failed scrape never writes partial data: nothing to commit.
$p = Start-Process $node 'scripts/scrape.mjs --all-semesters' -NoNewWindow -Wait -PassThru `
  -RedirectStandardOutput $out -RedirectStandardError $err
$summary = (Get-Content $out -Raw)
Add-Content $log ([string](Get-Content $err -Raw))
Remove-Item $out, $err
if ($p.ExitCode -or -not $summary) { Log "scrape failed (exit $($p.ExitCode))"; exit 1 }
$summary = $summary.Trim()
Log $summary

git add web/data/afeka
git diff --cached --quiet
if ($LASTEXITCODE) {
  git -c user.name=dolhack -c user.email=64908772+dolhack@users.noreply.github.com commit -m $summary
  if ($LASTEXITCODE) { Log 'git commit failed'; exit 1 }
  git push
  if ($LASTEXITCODE) { Log 'git push failed'; exit 1 }
}
