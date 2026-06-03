# Build Android no Windows: caminho curto + memoria Gradle.
# Uso: powershell -ExecutionPolicy Bypass -File .\scripts\run-android-windows.ps1

$ErrorActionPreference = "Stop"
$ShortDest = "C:\abast\controle-abast\mobile"
$RepoMobile = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not (Test-Path $ShortDest)) {
  Write-Host "Projeto curto nao encontrado. Rode primeiro:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\setup-short-path.ps1"
  exit 1
}

$cleanDirs = @(
  "$ShortDest\android\app\.cxx",
  "$ShortDest\android\app\build",
  "$ShortDest\android\build",
  "$ShortDest\node_modules\expo-modules-core\android\.cxx"
)
foreach ($d in $cleanDirs) {
  if (Test-Path $d) {
    Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue
  }
}

Set-Location $ShortDest
Write-Host "Build em $ShortDest"
# Uma ABI = menos memoria e paths menores. Emulador x86: troque para x86_64
npx expo run:android -- -PreactNativeArchitectures=arm64-v8a @args
