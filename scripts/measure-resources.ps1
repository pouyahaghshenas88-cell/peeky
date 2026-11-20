<#
.SYNOPSIS
  Measure Peeky and its WebView2 descendants on Windows.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/measure-resources.ps1 -Seconds 60
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/measure-resources.ps1 -ProcessId 1234 -Seconds 60
.NOTES
  Run the same workload and duration against each version after letting it settle.
  CPU is reported as percent of one logical core and as percent of all logical cores.
  Processes that start and exit entirely between samples may not be counted.
#>
param(
  [int]$ProcessId = 0,
  [ValidateRange(10, 3600)][int]$Seconds = 60,
  [ValidateRange(1, 30)][int]$Interval = 2
)
$ErrorActionPreference = 'Stop'
if (!$ProcessId) {
  $roots = @(Get-Process -Name 'peeky' -ErrorAction SilentlyContinue)
  if ($roots.Count -ne 1) { throw 'Specify -ProcessId when Peeky is not running or more than one instance exists.' }
  $ProcessId = $roots[0].Id
}
if (!(Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { throw "Process $ProcessId not found." }
$cores = [Environment]::ProcessorCount
function Sample-Tree([int]$rootId) {
  $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
  $ids = [System.Collections.Generic.HashSet[int]]::new()
  [void]$ids.Add($rootId)
  do {
    $changed = $false
    foreach ($p in $all) {
      if ($ids.Contains([int]$p.ParentProcessId) -and $ids.Add([int]$p.ProcessId)) { $changed = $true }
    }
  } while ($changed)
  $cpu = @{}; $private = 0L; $working = 0L
  foreach ($id in $ids) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if ($null -eq $p) { continue }
    try { $cpu[$id] = $p.TotalProcessorTime.TotalSeconds; $private += $p.PrivateMemorySize64; $working += $p.WorkingSet64 } catch { }
  }
  return @{ cpu = $cpu; private = $private; working = $working; count = $cpu.Count }
}
$previous = Sample-Tree $ProcessId
$watch = [System.Diagnostics.Stopwatch]::StartNew()
$lastTime = $watch.Elapsed.TotalSeconds
while ($watch.Elapsed.TotalSeconds -lt $Seconds) {
  Start-Sleep -Seconds $Interval
  $now = Sample-Tree $ProcessId
  $at = $watch.Elapsed.TotalSeconds
  $used = 0.0
  foreach ($id in $now.cpu.Keys) {
    $before = if ($previous.cpu.ContainsKey($id)) { $previous.cpu[$id] } else { 0.0 }
    $used += [Math]::Max(0.0, $now.cpu[$id] - $before)
  }
  $oneCore = 100.0 * $used / ($at - $lastTime)
  [pscustomobject]@{
    Seconds = [Math]::Round($at, 1); Processes = $now.count
    CpuOneCorePct = [Math]::Round($oneCore, 2); CpuSystemPct = [Math]::Round($oneCore / $cores, 2)
    PrivateMiB = [Math]::Round($now.private / 1MB, 1); WorkingSetMiB = [Math]::Round($now.working / 1MB, 1)
  }
  $previous = $now; $lastTime = $at
}
