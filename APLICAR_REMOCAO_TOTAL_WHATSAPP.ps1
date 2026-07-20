$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$pathsToRemove = @(
  "whatsapp-connector",
  "src\pages\Conversas",
  "src\pages\Configuracoes\WhatsAppLinkedDevicePanel.jsx",
  "src\services\whatsappLinkedDeviceService.js",
  "supabase\functions\whatsapp-connect",
  "supabase\functions\whatsapp-send",
  "supabase\functions\whatsapp-webhook",
  "WHATSAPP_LINKED_DEVICE_SETUP.md",
  "WHATSAPP_SETUP.md",
  "APLICAR_REMOCAO_WHATSAPP.ps1",
  "REMOVER_ARQUIVOS_WHATSAPP.ps1",
  "_payload",
  "dist",
  "node_modules\.vite"
)

foreach ($path in $pathsToRemove) {
  if (Test-Path $path) {
    Remove-Item -Recurse -Force $path
    Write-Host "Removido: $path"
  }
}

$forbiddenPatterns = @(
  "WhatsApp pelo celular",
  "Gerar QR Code",
  "Conversas sincronizadas",
  "Leads automáticos no CRM",
  "VITE_WHATSAPP_CONNECTOR_URL",
  "whatsappLinkedDeviceService",
  'path="conversas"',
  "route: '/conversas'"
)

$sourceFiles = Get-ChildItem -Path "src" -Recurse -File -Include *.js,*.jsx,*.ts,*.tsx
$failures = @()

foreach ($pattern in $forbiddenPatterns) {
  $hits = $sourceFiles | Select-String -SimpleMatch -Pattern $pattern
  if ($hits) {
    $failures += $hits
  }
}

if (Test-Path "whatsapp-connector") {
  throw "A pasta whatsapp-connector ainda existe."
}

if ($failures.Count -gt 0) {
  $failures | ForEach-Object { Write-Host "$($_.Path):$($_.LineNumber) $($_.Line)" -ForegroundColor Red }
  throw "Ainda existem referências da integração automática do WhatsApp."
}

Write-Host ""
Write-Host "Remoção total da integração automática do WhatsApp aplicada e validada." -ForegroundColor Green
Write-Host "Campos de telefone/WhatsApp para cadastro manual foram preservados." -ForegroundColor Green
