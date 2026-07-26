@echo off
rmdir /s /q "src\features\proposals" 2>nul
del /q "src\pages\Configuracoes\ModelosPropostas.jsx" 2>nul
del /q "src\pages\Configuracoes\ModelosPropostas.css" 2>nul
del /q "src\features\documents\editor\ProposalTemplateEditor.jsx" 2>nul
del /q "src\features\documents\editor\ProposalTemplateEditor.css" 2>nul
del /q "src\features\documents\editor\ProposalTemplateEditorEnhancements.css" 2>nul
del /q "src\features\documents\editor\proposalLayoutLibrary.js" 2>nul
echo Editor de propostas removido.
pause
