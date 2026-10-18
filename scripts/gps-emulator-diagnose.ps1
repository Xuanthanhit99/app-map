<#
  Reality / Map App - Android emulator GPS provider diagnosis (READ-ONLY + geo fix).
  Run in Windows PowerShell with the Android SDK platform-tools on PATH.
  This script NEVER wipes data, uninstalls the app or changes app code.

  Usage:
    .\scripts\gps-emulator-diagnose.ps1                       # default Hanoi point
    .\scripts\gps-emulator-diagnose.ps1 -Lon 105.8542 -Lat 21.0285

  NOTE: `adb emu geo fix` takes LONGITUDE first, then LATITUDE.
#>
param(
  [double]$Lon = 105.8542,
  [double]$Lat = 21.0285,
  [string]$Package = "com.xuanthanhit99.reality"
)

function Section($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

Section "1. ADB / emulator connection"
adb version
adb devices -l
$serial = (adb devices | Select-String "emulator-\d+\s+device" | Select-Object -First 1)
if (-not $serial) { Write-Host "BLOCKED: no emulator in 'device' state. Start the AVD (Cold Boot) first." -ForegroundColor Red; exit 1 }
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk

Section "2. System location switch"
adb shell cmd location is-location-enabled
adb shell settings get secure location_mode

Section "3. Providers + active requests BEFORE geo fix"
# Key question: does the gps provider have ANY active request?
# 'Number of location reports = 0' is expected if no client is requesting gps.
adb shell dumpsys location | Select-String -Pattern "gps provider|fused provider|network provider|last location|location reports|Active Requests|request|enabled" -SimpleMatch:$false | Select-Object -First 80

Section "4. App permission state"
adb shell dumpsys package $Package | Select-String "ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION"
adb shell appops get $Package FINE_LOCATION
adb shell appops get $Package COARSE_LOCATION

Section "5. Send geo fix (lon=$Lon lat=$Lat) three times"
1..3 | ForEach-Object { adb emu geo fix $Lon $Lat; Start-Sleep -Seconds 2 }

Section "6. Providers AFTER geo fix"
adb shell dumpsys location | Select-String -Pattern "gps provider|fused provider|last location|location reports|Active Requests" | Select-Object -First 60

Section "Interpretation"
@"
- gps 'last location' now set and reports > 0  -> provider OK. Run Reality location E2E.
- gps has NO active request                      -> no client asked for GPS; reports=0 is not yet a provider fault.
     Open Google Maps on the emulator (forces a high-accuracy request), re-run this script.
     If Maps gets the fix but Reality does not, collect: adb logcat -s ReactNativeJS:V | findstr RealityLocation
- gps HAS active request but reports stay 0 after Cold Boot + 'Enable GPS signal' in Extended Controls
     -> AVD/provider fault. Create a clean AVD (Google APIs or Play image, API 34/35). Do NOT wipe the old one without approval.
"@ | Write-Host
