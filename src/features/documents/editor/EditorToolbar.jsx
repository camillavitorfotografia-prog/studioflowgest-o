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
      <button
        type="button"
        className="contract-editor-back"
        onClick={onBack}
        title="Voltar aos modelos"
      >
        <ArrowLeft />
        <span className="contract-toolbar-label">Voltar</span>
      </button>

      <div className="contract-editor-title">
        <input
          value={template.name || ''}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label="Nome do modelo de contrato"
        />
        <span>
          {template.category}
          {' · '}
          v{template.version}
          {' · '}
          {template.isPublished ? 'Publicado' : 'Rascunho'}
        </span>
      </div>

      <div className="contract-editor-actions">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Desfazer (Ctrl+Z)"
        >
          <Undo2 />
          <span className="contract-toolbar-label">Desfazer</span>
        </button>

        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Refazer (Ctrl+Shift+Z)"
        >
          <Redo2 />
          <span className="contract-toolbar-label">Refazer</span>
        </button>

        <button
          type="button"
          className="apply-blueprint"
          onClick={onApplyBlueprint}
          title="Aplicar modelo completo"
        >
          <FileImage />
          <span className="contract-toolbar-label contract-toolbar-label-full">Aplicar modelo completo</span>
          <span className="contract-toolbar-label contract-toolbar-label-short">Modelo</span>
        </button>

        <button type="button" onClick={onSave} title="Salvar alterações">
          <Save />
          <span className="contract-toolbar-label">Salvar</span>
        </button>

        <button
          type="button"
          className="publish"
          onClick={onPublish}
          title="Publicar nova versão"
        >
          <span className="contract-toolbar-label contract-toolbar-label-full">Publicar nova versão</span>
          <span className="contract-toolbar-label contract-toolbar-label-short">Publicar</span>
        </button>
      </div>
    </header>
  );
}
