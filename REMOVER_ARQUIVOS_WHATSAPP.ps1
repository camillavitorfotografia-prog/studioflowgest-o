$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Remove-Item -Recurse -Force (Join-Path $root 'src\pages\Conversas') -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $root 'src\pages\Configuracoes\WhatsAppLinkedDevicePanel.jsx') -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $root 'src\pages\Configuracoes\WhatsAppLinkedDevicePanel.css') -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $root 'src\services\whatsapp') -ErrorAction SilentlyContinue
Remove-Item -Force (Join-Path $root 'src\services\whatsappConnectorService.js') -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $root 'whatsapp-connector') -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $root 'node_modules\.vite') -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $root 'dist') -ErrorAction SilentlyContinue
Write-Host 'WhatsApp removido da sidebar, das Configuracoes e das rotas.' -ForegroundColor Green
