# Copies the Warlock sim's data and engine files into vendor/warlock-sim (a read-only copy; never edit it here).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools\sync-sim.ps1 [-Sim <path to the sim project>]
# Keep this file ASCII (Windows PowerShell 5.1).
param([string]$Sim = (Join-Path $PSScriptRoot '..\..\wow-forever-warlock-sim'))
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Sim)) { throw "Sim project not found: $Sim" }
$simRoot = (Resolve-Path $Sim).Path
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dest = Join-Path $root 'vendor\warlock-sim'

# Load order matters: data first, then the engine (the same order the sim's own loader uses).
$files = @(
  'data/consumables.js', 'data/config.js', 'data/talents.js', 'data/spells.js', 'data/races.js', 'data/builds.js',
  'engine/stats.js', 'engine/spelltable.js', 'engine/rng.js', 'engine/resist.js', 'engine/rotation.js', 'engine/sim.js',
  'engine/custom-builds.js', 'engine/settings-code.js',
  'data/icons.js', 'data/tooltips.js'
)

$changed = @(); $added = @()
foreach ($f in $files) {
  $src = Join-Path $simRoot $f
  if (-not (Test-Path $src)) { throw "Missing in the sim: $f" }
  $dst = Join-Path $dest $f
  $dir = Split-Path $dst -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  if (-not (Test-Path $dst)) { $added += $f }
  elseif ((Get-FileHash $src).Hash -ne (Get-FileHash $dst).Hash) { $changed += $f }
  Copy-Item $src $dst -Force
}

# Remove copies of files that are no longer on the list.
$removed = @()
foreach ($sub in @('data', 'engine')) {
  $d = Join-Path $dest $sub
  if (Test-Path $d) {
    Get-ChildItem $d -File | ForEach-Object {
      $rel = "$sub/$($_.Name)"
      if ($files -notcontains $rel) { Remove-Item $_.FullName -Force -Confirm:$false; $removed += $rel }
    }
  }
}

# Stamp: which sim commit this copy is.
$commit = 'unknown'; $subject = ''; $dirty = $false
try {
  $commit = (& git -C $simRoot rev-parse --short HEAD).Trim()
  $subject = (& git -C $simRoot log -1 --format=%s).Trim()
  $dirty = [bool](& git -C $simRoot status --porcelain -- data engine)
} catch { }
$manifest = [ordered]@{
  source = 'Warlock DPS sim (sibling project)'
  commit = $commit
  subject = $subject
  uncommittedChanges = $dirty
  synced = (Get-Date).ToString('yyyy-MM-dd HH:mm')
  files = $files
}
$json = $manifest | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $dest 'manifest.json'), $json, (New-Object Text.UTF8Encoding $false))

Write-Host "Synced $($files.Count) files from sim commit $commit ($subject)"
if ($dirty) { Write-Host 'NOTE: the sim has uncommitted changes in data/ or engine/ - the copy includes them.' }
if ($added.Count)   { Write-Host "  new:     $($added -join ', ')" }
if ($changed.Count) { Write-Host "  changed: $($changed -join ', ')" }
if ($removed.Count) { Write-Host "  removed: $($removed -join ', ')" }
if (-not ($added.Count + $changed.Count + $removed.Count)) { Write-Host '  nothing changed.' }
