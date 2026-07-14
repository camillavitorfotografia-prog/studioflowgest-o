# Editor de contratos StudioFlow

A pasta foi preparada para a arquitetura modular do editor.

## Componentes já extraídos e conectados
- `EditorToolbar.jsx`
- `MobileTabs.jsx`
- `PagesPanel.jsx`

## Componentes criados para a próxima extração incremental
- `Canvas.jsx`
- `CanvasElement.jsx`
- `CanvasToolbar.jsx`
- `ElementsPanel.jsx`
- `LayersPanel.jsx`
- `PropertiesPanel.jsx`
- `RichTextEditor.jsx`
- `SelectionBox.jsx`
- `ResizeHandles.jsx`
- `AlignmentGuides.jsx`
- `Rulers.jsx`
- `ContextToolbar.jsx`

## Hooks e comandos
- `hooks/useEditorHistory.js`
- `hooks/useCanvasSelection.js`
- `hooks/useDragResize.js`
- `hooks/useKeyboardShortcuts.js`
- `utils/editorCommands.js`

O `ContractTemplateEditor.jsx` continua preservando todas as funções atuais. A migração foi iniciada pelas áreas de menor risco para evitar regressões e tela preta.
