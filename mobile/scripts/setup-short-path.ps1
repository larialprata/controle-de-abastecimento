# Copia o repo para C:\abast\controle-abast (caminho REAL curto).
# O subst Z: nao encurta paths do CMake — so copiar/mover resolve.
# Uso: powershell -ExecutionPolicy Bypass -File .\scripts\setup-short-path.ps1

$ErrorActionPreference = "Stop"
$Src = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Dest = "C:\abast\controle-abast"

Write-Host "Origem:  $Src"
Write-Host "Destino: $Dest"

New-Item -ItemType Directory -Path "C:\abast" -Force | Out-Null

$excludeDirs = @(
  "node_modules",
  ".gradle",
  ".cxx",
  "build",
  "dist",
  ".git"
)

Write-Host "Copiando (sem node_modules / caches Android)..."
$robocopyArgs = @(
  $Src,
  $Dest,
  "/E",
  "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np",
  "/XD"
) + $excludeDirs

& robocopy @robocopyArgs | Out-Null
# robocopy: 0-7 = sucesso
if ($LASTEXITCODE -gt 7) {
  throw "robocopy falhou com codigo $LASTEXITCODE"
}

$MobileDest = Join-Path $Dest "mobile"
if (-not (Test-Path $MobileDest)) {
  throw "Destino incompleto: $MobileDest"
}

Write-Host "npm install em $MobileDest ..."
Set-Location $MobileDest
npm install

Write-Host ""
Write-Host "Pronto. Abra o projeto em:"
Write-Host "  cd C:\abast\controle-abast\mobile"
Write-Host "  npx expo run:android -- -PreactNativeArchitectures=arm64-v8a"
Write-Host ""
Write-Host "Copie seus .env (api, web, mobile) para os mesmos caminhos em C:\abast\controle-abast\ ..."
