export default function RichTextEditor({
  element,
  editing,
  onMouseUp,
  onKeyUp,
  onInput,
  onBlur,
  editorRef,
}) {
  const html = element.htmlContent
    || String(element.content || '').replace(/\n/g, '<br>');

  if (editing) {
    return (
      <div
        className="contract-rich-text-content"
        data-rich-text-id={element.id}
        contentEditable
        suppressContentEditableWarning
        ref={(node) => {
          if (node && !node.dataset.initialized) {
            node.innerHTML = html;
            node.dataset.initialized = 'true';
          }
          editorRef?.(node);
        }}
        onMouseUp={onMouseUp}
        onKeyUp={onKeyUp}
        onInput={onInput}
        onBlur={onBlur}
      />
    );
  }

  return (
    <div
      className="contract-rich-text-content"
      data-rich-text-id={element.id}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
