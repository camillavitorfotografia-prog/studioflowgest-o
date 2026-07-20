$ErrorActionPreference = 'Stop'
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = $packageRoot

if (-not (Test-Path (Join-Path $projectRoot 'package.json'))) {
  $candidate = Split-Path -Parent $packageRoot
  if (Test-Path (Join-Path $candidate 'package.json')) {
    $projectRoot = $candidate
  } else {
    throw 'Coloque esta pasta dentro da raiz do CV-Studio, onde está o package.json.'
  }
}

$payloadRoot = Join-Path $packageRoot '_payload'
if (-not (Test-Path $payloadRoot)) {
  throw 'A pasta _payload não foi encontrada. Extraia o ZIP completo antes de executar.'
}

Write-Host "Projeto identificado em: $projectRoot" -ForegroundColor Cyan

$filesToCopy = @(
  'src\App.jsx',
  'src\pages\Configuracoes\index.jsx',
  'src\services\integrationsService.js',
  'src\utils\settings.js',
  'src\utils\sidebarModules.js',
  'supabase\migrations\20260720093000_remove_whatsapp_integration.sql'
)

foreach ($relativePath in $filesToCopy) {
  $source = Join-Path $payloadRoot $relativePath
  $destination = Join-Path $projectRoot $relativePath
  $destinationDir = Split-Path -Parent $destination
  New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
  Copy-Item -Force $source $destination
  Write-Host "Atualizado: $relativePath"
}

$pathsToRemove = @(
  'src\pages\Conversas',
  'src\pages\Configuracoes\WhatsAppLinkedDevicePanel.jsx',
  'src\services\whatsappLinkedDeviceService.js',
  'supabase\functions\whatsapp-connect',
  'supabase\functions\whatsapp-send',
  'supabase\functions\whatsapp-webhook',
  'whatsapp-connector',
  'WHATSAPP_SETUP.md',
  'WHATSAPP_LINKED_DEVICE_SETUP.md',
  'dist',
  'node_modules\.vite'
)

foreach ($relativePath in $pathsToRemove) {
  $fullPath = Join-Path $projectRoot $relativePath
  if (Test-Path $fullPath) {
    Remove-Item -Recurse -Force $fullPath
    Write-Host "Removido: $relativePath"
  }
}

foreach ($envName in @('.env.local', '.env', '.env.example')) {
  $envPath = Join-Path $projectRoot $envName
  if (Test-Path $envPath) {
    $filtered = Get-Content $envPath | Where-Object {
      $_ -notmatch '^\s*VITE_WHATSAPP_CONNECTOR_URL\s*='
    }
    Set-Content -Path $envPath -Value $filtered -Encoding utf8
  }
}

$appContent = Get-Content (Join-Path $projectRoot 'src\App.jsx') -Raw
$sidebarContent = Get-Content (Join-Path $projectRoot 'src\utils\sidebarModules.js') -Raw
$configContent = Get-Content (Join-Path $projectRoot 'src\pages\Configuracoes\index.jsx') -Raw

if ($appContent -match "pages/Conversas|path=\"conversas\"") {
  throw 'A rota Conversas ainda foi encontrada no App.jsx.'
}
if ($sidebarContent -match "id:\s*'conversas'|route:\s*'/conversas'") {
  throw 'O item Conversas ainda foi encontrado no menu lateral.'
}
if ($configContent -match 'WhatsAppLinkedDevicePanel|WhatsApp pelo celular|Gerar QR Code') {
  throw 'O painel de conexão do WhatsApp ainda foi encontrado nas Configurações.'
}

Write-Host ''
Write-Host 'Remoção aplicada e validada. Feche o servidor Vite antigo e execute npm run dev novamente.' -ForegroundColor Green
