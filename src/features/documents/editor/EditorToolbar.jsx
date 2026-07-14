import {
  ArrowLeft,
  FileImage,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react';

export default function EditorToolbar({
  template,
  canUndo,
  canRedo,
  onBack,
  onNameChange,
  onUndo,
  onRedo,
  onApplyBlueprint,
  onSave,
  onPublish,
}) {
  return (
    <header className="contract-editor-toolbar">
      <button type="button" onClick={onBack}>
        <ArrowLeft />
        Voltar
      </button>

      <div className="contract-editor-title">
        <input
          value={template.name || ''}
          onChange={(event) => onNameChange(event.target.value)}
        />
        <span>
          {template.category}
          {' · '}
          v{template.version}
          {' · '}
          {template.isPublished ? 'Publicado' : 'Rascunho'}
        </span>
      </div>

      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title="Desfazer (Ctrl+Z)"
      >
        <Undo2 />
        Desfazer
      </button>

      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title="Refazer (Ctrl+Shift+Z)"
      >
        <Redo2 />
        Refazer
      </button>

      <button
        type="button"
        className="apply-blueprint"
        onClick={onApplyBlueprint}
      >
        <FileImage />
        Aplicar modelo completo
      </button>

      <button type="button" onClick={onSave}>
        <Save />
        Salvar
      </button>

      <button
        type="button"
        className="publish"
        onClick={onPublish}
      >
        Publicar nova versão
      </button>
    </header>
  );
}
