<#
  Reality / Map App - Android emulator GPS provider diagnosis.
  Run in Windows PowerShell with Android SDK platform-tools (adb) on PATH.

  SAFETY: read-only except `adb emu geo fix` (the permitted mock-position command).
  It NEVER wipes data, clears app data, uninstalls, changes system settings or edits app code.

  Usage:
    .\scripts\gps-emulator-diagnose.ps1                                   # first emulator, Hanoi point
    .\scripts\gps-emulator-diagnose.ps1 -Serial emulator-5554 -Lon 105.8542 -Lat 21.0285

  NOTE: `adb emu geo fix` takes LONGITUDE first, then LATITUDE.
#>
param(
  [string]$Serial = "",
  [double]$Lon = 105.8542,
  [double]$Lat = 21.0285,
  [string]$Package = "com.xuanthanhit99.reality",
  [string]$OutFile = "gps-diagnosis-$(Get-Date -Format yyyyMMdd-HHmmss).txt"
)

if ([math]::Abs($Lat) -gt 90 -or [math]::Abs($Lon) -gt 180) { Write-Host "Invalid coordinates (Lon first, Lat second)." -ForegroundColor Red; exit 2 }

# Vietnamese/European locales use a decimal comma; adb needs a dot.
$LonS = $Lon.ToString([cultureinfo]::InvariantCulture)
$LatS = $Lat.ToString([cultureinfo]::InvariantCulture)

Start-Transcript -Path $OutFile | Out-Null
function Section($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

Section "1. ADB / emulator connection"
adb version
adb devices -l
if (-not $Serial) {
  $line = adb devices | Select-String "^(emulator-\d+)\s+device" | Select-Object -First 1
  if ($line) { $Serial = $line.Matches[0].Groups[1].Value }
}
if (-not $Serial) { Write-Host "BLOCKED: no emulator in 'device' state. Cold Boot the AVD first." -ForegroundColor Red; Stop-Transcript | Out-Null; exit 1 }
function A { adb -s $Serial @args }
Write-Host "Using $Serial"
A shell getprop ro.build.version.release
A shell getprop ro.build.version.sdk
A shell getprop ro.kernel.qemu
A shell "date +%s%3N"   # device wall clock (ms) - compare with host for clock skew
Write-Host ("host epoch ms: " + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())

Section "2. System location switch (read only)"
A shell cmd location is-location-enabled
A shell settings get secure location_mode
A shell settings get secure location_providers_allowed

Section "3. App permission + app-op state (read only)"
A shell dumpsys package $Package | Select-String "ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION"
A shell appops get $Package FINE_LOCATION
A shell appops get $Package COARSE_LOCATION

Section "4. dumpsys location BEFORE geo fix (full copy saved in transcript)"
$before = A shell dumpsys location
$before | Select-String -Pattern "gps provider|fused provider|network provider|passive provider|last location|location reports|Request\[|$Package" | Select-Object -First 80

Section "5. Send geo fix (lon=$LonS lat=$LatS) x3"
1..3 | ForEach-Object { A emu geo fix $LonS $LatS; Start-Sleep -Seconds 2 }

Section "6. dumpsys location AFTER geo fix"
$after = A shell dumpsys location
$after | Select-String -Pattern "gps provider|fused provider|last location|location reports|Request\[|$Package" | Select-Object -First 80

Section "7. Which provider did the Reality request land on?"
$appLines = $after | Select-String -Pattern $Package
if ($appLines) { $appLines } else { Write-Host "No active request from $Package found. Open the Map tab with location enabled, then re-run." -ForegroundColor Yellow }

Section "Interpretation (do not conclude a provider fault from 'reports = 0' alone)"
@"
expo-location watchPositionAsync(Accuracy.Balanced) on Android requests the FUSED provider at balanced power.
A fused request does not necessarily create a request on the 'gps' provider, so gps 'location reports = 0'
is expected when only Reality is running. Decide from the provider that Reality's request is attached to:

A. Reality request on fused AND fused/gps 'last location' updated after geo fix
     -> environment OK. Run Reality location E2E; collect: adb -s $Serial logcat -s ReactNativeJS:V | findstr RealityLocation
B. Reality request on fused, fused never updates, gps has no request
     -> open Google Maps on the emulator (forces a high-accuracy request), re-run. If Maps gets a fix and
        Reality does not, attach this transcript: it is an app/provider-priority question, not proven yet.
C. gps HAS an active request, Extended Controls 'Enable GPS signal' is ON, Cold Boot done, reports stay 0
     -> AVD/provider fault. Create a clean AVD (Google Play image, API 34/35). Keep the old AVD; wipe only with approval.
D. Device clock vs host clock differ by > 1 s (section 1)
     -> fixes may be rejected by the 0 ms future-skew display gate (CHECKPOINT-02). Record the skew value.
"@ | Write-Host

Stop-Transcript | Out-Null
Write-Host "Saved: $OutFile" -ForegroundColor Green
