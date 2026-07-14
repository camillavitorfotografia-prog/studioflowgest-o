import {
  Circle,
  ImagePlus,
  Plus,
  Square,
  Type,
} from 'lucide-react';

export default function ElementsPanel({
  onAddText,
  onAddField,
  onAddLogo,
  onAddRectangle,
  onAddSquare,
  onAddCircle,
}) {
  return (
    <section className="contract-add-elements">
      <h3>Adicionar</h3>
      <div>
        <button type="button" onClick={onAddText}>
          <Type /> Texto
        </button>
        <button type="button" onClick={onAddField}>
          <Plus /> Campo
        </button>
        <button type="button" onClick={onAddLogo}>
          <ImagePlus /> Logomarca
        </button>
        <button type="button" onClick={onAddRectangle}>
          <Plus /> Retângulo
        </button>
        <button type="button" onClick={onAddSquare}>
          <Square /> Quadrado
        </button>
        <button type="button" onClick={onAddCircle}>
          <Circle /> Círculo
        </button>
      </div>
    </section>
  );
}
