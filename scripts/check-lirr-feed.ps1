# Quick external verification of MTA's LIRR GTFS-RT feed.
# Same logic as scripts/check-lirr-feed.py, but PowerShell-only so you
# don't need a working Python install. Doesn't touch our app code.

$url = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr'
Write-Host "Fetching $url ..."
$res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
$bytes = $res.Content
if ($bytes -is [string]) { $bytes = [System.Text.Encoding]::GetEncoding(28591).GetBytes($bytes) }
Write-Host ("Got {0} bytes`n" -f $bytes.Length)

function Read-Varint([byte[]]$buf, [ref]$pos) {
    $val = 0L; $shift = 0
    while ($true) {
        $b = $buf[$pos.Value]; $pos.Value++
        $val = $val -bor ([int64]($b -band 0x7f) -shl $shift)
        if (($b -band 0x80) -eq 0) { return $val }
        $shift += 7
    }
}

$pos = 0
$nTotal = 0; $nVehicle = 0; $nTripUpdate = 0; $nAlert = 0; $nOther = 0
$firstVehicleId = $null; $firstTripId = $null

while ($pos -lt $bytes.Length) {
    $tag = $bytes[$pos]; $pos++
    if ($tag -ne 0x12) {
        $p = [ref]$pos
        $len = Read-Varint $bytes $p
        $pos = $p.Value + [int]$len
        continue
    }
    $p = [ref]$pos
    $entLen = Read-Varint $bytes $p
    $pos = $p.Value
    $entEnd = $pos + [int]$entLen
    $nTotal++

    $hasVehicle = $false; $hasTripUpdate = $false; $hasAlert = $false
    $entId = $null
    $ep = $pos
    while ($ep -lt $entEnd) {
        $ftag = $bytes[$ep]; $ep++
        $pp = [ref]$ep
        $flen = Read-Varint $bytes $pp
        $ep = $pp.Value
        if ($ftag -eq 0x0a) {
            $entId = [System.Text.Encoding]::UTF8.GetString($bytes, $ep, [int]$flen)
        } elseif ($ftag -eq 0x1a) { $hasTripUpdate = $true }
          elseif ($ftag -eq 0x22) { $hasVehicle    = $true }
          elseif ($ftag -eq 0x2a) { $hasAlert      = $true }
        $ep += [int]$flen
    }
    if ($hasVehicle)    { $nVehicle++;    if (-not $firstVehicleId) { $firstVehicleId = $entId } }
    if ($hasTripUpdate) { $nTripUpdate++; if (-not $firstTripId)    { $firstTripId    = $entId } }
    if ($hasAlert)      { $nAlert++ }
    if (-not ($hasVehicle -or $hasTripUpdate -or $hasAlert)) { $nOther++ }
    $pos = $entEnd
}

Write-Host ("Entities: {0}" -f $nTotal)
Write-Host ("  with VehiclePosition: {0}" -f $nVehicle)
Write-Host ("  with TripUpdate:      {0}" -f $nTripUpdate)
Write-Host ("  with Alert:           {0}" -f $nAlert)
Write-Host ("  other:                {0}" -f $nOther)
if ($firstTripId)    { Write-Host ("`nSample TripUpdate entity id: {0}" -f $firstTripId) }
if ($firstVehicleId) {
    Write-Host ("Sample VehiclePosition entity id: {0}" -f $firstVehicleId)
} else {
    Write-Host ""
    Write-Host ">>> No vehicle positions in the feed right now." -ForegroundColor Yellow
    Write-Host ">>> MTA's LIRR vehicle reporting is currently down; this is upstream." -ForegroundColor Yellow
}
