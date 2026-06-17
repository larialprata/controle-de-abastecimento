$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$mobileRoot = Join-Path $root "mobile"

Write-Host "Parando Gradle..."
$gradle = Join-Path $mobileRoot "android\gradlew.bat"
if (Test-Path $gradle) {
  Push-Location (Split-Path $gradle)
  & .\gradlew.bat --stop 2>$null
  Pop-Location
}
Get-Process -Name java -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "Removendo mobile/node_modules..."
$mobileNm = Join-Path $mobileRoot "node_modules"
if (Test-Path $mobileNm) {
  cmd /c "rmdir /s /q `"$mobileNm`"" 2>$null
}

Write-Host "Removendo artefatos Gradle em node_modules..."
Get-ChildItem (Join-Path $root "node_modules") -Directory -Filter ".netinfo-*" -ErrorAction SilentlyContinue |
  ForEach-Object { cmd /c "rmdir /s /q `"$($_.FullName)`"" 2>$null }
Get-ChildItem (Join-Path $root "node_modules") -Directory -Filter ".expo-*" -ErrorAction SilentlyContinue |
  ForEach-Object { cmd /c "rmdir /s /q `"$($_.FullName)`"" 2>$null }

Write-Host "Reinstalando dependencias na raiz..."
Push-Location $root
npm install
Pop-Location

Write-Host "Verificando pacotes (raiz ou mobile/node_modules)..."
$expoCameraRoot = Test-Path (Join-Path $root "node_modules\expo-camera\package.json")
$netinfoRoot = Test-Path (Join-Path $root "node_modules\@react-native-community\netinfo\package.json")
$netinfoMobile = Test-Path (Join-Path $mobileNm "@react-native-community\netinfo\package.json")
Write-Host "expo-camera (raiz): $expoCameraRoot"
Write-Host "netinfo (raiz): $netinfoRoot"
Write-Host "netinfo (mobile): $netinfoMobile"
if (-not $expoCameraRoot) {
  Write-Error "expo-camera ausente. Execute na raiz: npm install"
}
if (-not $netinfoRoot -and -not $netinfoMobile) {
  Write-Error "netinfo ausente. Execute na raiz: npm install"
}
Push-Location (Join-Path $mobileRoot "")
node -e "console.log('resolve netinfo', require.resolve('@react-native-community/netinfo')); console.log('resolve camera', require.resolve('expo-camera'));"
Pop-Location
Write-Host "OK"
