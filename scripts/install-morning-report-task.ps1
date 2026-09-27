param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')]
    [string]$At,
    [Parameter(Mandatory = $true)]
    [string]$WatchlistPath,
    [string]$TaskName = 'Jev Morning Investment Report'
)

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$inputDirectory = Join-Path $projectRoot 'data\investments\inbox'
$outputDirectory = Join-Path $projectRoot 'data\investments\reports'
$runnerPath = Join-Path $projectRoot 'scripts\run-morning-report.js'
$resolvedWatchlist = (Resolve-Path -LiteralPath $WatchlistPath -ErrorAction Stop).Path

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    throw "Zadanie '$TaskName' już istnieje. Nie zostało zmienione. Usuń je ręcznie albo podaj inną nazwę."
}

$todayAt = [datetime]::ParseExact($At, 'HH:mm', $null)
$startAt = Get-Date -Hour $todayAt.Hour -Minute $todayAt.Minute -Second 0
if ($startAt -le (Get-Date)) { $startAt = $startAt.AddDays(1) }

$arguments = ('"{0}" --input-dir "{1}" --output-dir "{2}" --watchlist "{3}"' -f $runnerPath, $inputDirectory, $outputDirectory, $resolvedWatchlist)
$action = New-ScheduledTaskAction -Execute $nodePath -Argument $arguments -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $startAt

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Description 'Tworzy lokalny, tylko-do-odczytu raport inwestycyjny Jev z najnowszego pliku JSON.' | Out-Null
Write-Output "Utworzono zadanie '$TaskName' na $At."
