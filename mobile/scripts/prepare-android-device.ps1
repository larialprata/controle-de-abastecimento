# Prepara celular físico via USB: redireciona Metro (8081) e API (3001) para o PC.
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
  Write-Host "adb não encontrado. Instale Android SDK Platform-Tools."
  exit 1
}
& $adb devices
& $adb reverse tcp:8081 tcp:8081
& $adb reverse tcp:3001 tcp:3001
Write-Host "OK: adb reverse 8081 e 3001 configurados."
