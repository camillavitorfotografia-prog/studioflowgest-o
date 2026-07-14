import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Circle,
  Redo2,
  Bold,
  BringToFront,
  Copy,
  FileImage,
  FilePlus2,
  ImagePlus,
  Italic,
  Lock,
  Plus,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  Underline,
  Unlock,
} from 'lucide-react';
import {
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  getTemplate,
  saveTemplate,
} from '../storage/documentStorageAdapter';
import {
  createDraftVersion,
  publishNewVersion,
} from '../services/templateVersionManager';
import { createId } from '../utils/documentIds';
import {
  buildContractBlueprint,
  CONTRACT_BLUEPRINT_VERSION,
  CONTRACT_FIELD_OPTIONS,
} from './contractTemplateBlueprints';
import './ContractTemplateEditor.css';

const newPage = (order) => ({
  id: createId('page'),
  name: `Página ${order + 1}`,
  order,
  active: true,
  width: 595.28,
  height: 841.89,
  background: {
    type: 'color',
    color: '#fffdf9',
    url: null,
    opacity: 1,
  },
  elements: [],
  metadata: {
    fixedLegalContent: false,
    editableLegalContent: true,
  },
});

const baseElement = (type) => ({
  id: createId(type),
  type,
  x: 60,
  y: 100,
  width: 240,
  height: type === 'text' ? 90 : 40,
  rotation: 0,
  opacity: 1,
  zIndex: 1,
  locked: false,
  visible: true,
  metadata: {},
});

const newDynamicField = () => ({
  ...baseElement('dynamicField'),
  placeholderKey: 'client.name',
  label: 'Nome do cliente',
  fontFamily: 'Helvetica',
  fontSize: 12,
  fontWeight: '400',
  color: '#222222',
  align: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
  hideIfEmpty: true,
});

const newText = () => ({
  ...baseElement('text'),
  content: 'Clique aqui e edite este texto.',
  fontFamily: 'Helvetica',
  fontSize: 12,
  fontWeight: '400',
  fontStyle: 'normal',
  color: '#222222',
  align: 'left',
  lineHeight: 1.45,
  letterSpacing: 0,
  textTransform: 'none',
  hideIfEmpty: false,
});

const newLogo = () => ({
  ...baseElement('logo'),
  x: 175,
  y: 60,
  width: 245,
  height: 145,
  src: '',
  alt: 'Logomarca',
  objectFit: 'contain',
  objectPositionX: 50,
  objectPositionY: 50,
  imageScale: 1,
  preserveAspectRatio: true,
});

const newOverlay = () => ({
  ...baseElement('overlay'),
  width: 300,
  height: 150,
  backgroundColor: '#f2d5c1',
  borderColor: '#c89f84',
  borderWidth: 1,
  borderRadius: 12,
});

const newRectangle = () => ({
  ...newOverlay(),
  width: 300,
  height: 140,
  borderRadius: 8,
});

const newSquare = () => ({
  ...newOverlay(),
  width: 160,
  height: 160,
  borderRadius: 8,
});

const newCircle = () => ({
  ...newOverlay(),
  width: 160,
  height: 160,
  borderRadius: 80,
});

const getElementLabel = (element = {}) => {
  if (element.type === 'text') {
    return element.content?.slice(0, 30) || 'Texto';
  }

  if (element.type === 'logo') return 'Logomarca';
  if (element.type === 'image') return 'Imagem';
  if (element.type === 'overlay') return 'Forma';
  return element.placeholderKey || 'Campo variável';
};

export default function ContractTemplateEditor() {
  const {
    templateId: paramTemplateId,
    modelId: paramModelId,
  } = useParams();

  const templateId = paramTemplateId || paramModelId;
  const navigate = useNavigate();

  const [template, setTemplate] = useState(null);
  const [pageId, setPageId] = useState(null);
  const [fieldId, setFieldId] = useState(null);
  const [mobileTab, setMobileTab] = useState('pages');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [alignmentGuides, setAlignmentGuides] = useState({
    vertical: null,
    horizontal: null,
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingTextId, setEditingTextId] = useState(null);
  const [history, setHistory] = useState({
    past: [],
    future: [],
  });
  const interactionRef = useRef(null);
  const skipHistoryRef = useRef(false);
  const savedSelectionRef = useRef(null);

  useEffect(() => {
    let active = true;

    Promise.resolve().then(() => {
      setTemplate(null);
      setPageId(null);
      setFieldId(null);
      setLoading(true);
    });

    (async () => {
      const data = await getTemplate(templateId);

      if (!active) return;

      setTemplate(data);
      setPageId(data?.pages?.[0]?.id || null);
      setSelectedIds([]);
      setHistory({
        past: [],
        future: [],
      });
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [templateId]);

  const pages = useMemo(
    () => [...(template?.pages || [])].sort(
      (first, second) => (
        (first.order || 0) - (second.order || 0)
      ),
    ),
    [template],
  );

  const page = pages.find(
    (item) => item.id === pageId,
  ) || null;

  const field = page?.elements?.find(
    (item) => item.id === fieldId,
  ) || null;

  const cloneTemplate = (value) => (
    value
      ? JSON.parse(JSON.stringify(value))
      : value
  );

  const commitTemplateChange = (updater) => {
    setTemplate((current) => {
      const next = typeof updater === 'function'
        ? updater(current)
        : updater;

      if (!current || !next || current === next) {
        return next;
      }

      if (!skipHistoryRef.current) {
        setHistory((historyState) => ({
          past: [
            ...historyState.past.slice(-39),
            cloneTemplate(current),
          ],
          future: [],
        }));
      }

      return next;
    });
  };

  const undo = () => {
    setHistory((historyState) => {
      if (!historyState.past.length) {
        return historyState;
      }

      const previous = historyState.past.at(-1);

      setTemplate((current) => {
        skipHistoryRef.current = true;

        queueMicrotask(() => {
          skipHistoryRef.current = false;
        });

        return cloneTemplate(previous);
      });

      return {
        past: historyState.past.slice(0, -1),
        future: [
          cloneTemplate(template),
          ...historyState.future,
        ].slice(0, 40),
      };
    });
  };

  const redo = () => {
    setHistory((historyState) => {
      if (!historyState.future.length) {
        return historyState;
      }

      const next = historyState.future[0];

      setTemplate((current) => {
        skipHistoryRef.current = true;

        queueMicrotask(() => {
          skipHistoryRef.current = false;
        });

        return cloneTemplate(next);
      });

      return {
        past: [
          ...historyState.past,
          cloneTemplate(template),
        ].slice(-40),
        future: historyState.future.slice(1),
      };
    });
  };

  const selectedElements = (page?.elements || []).filter(
    (item) => selectedIds.includes(item.id),
  );

  const selectElement = (
    item,
    event = null,
  ) => {
    const additive = Boolean(
      event?.shiftKey
      || event?.ctrlKey
      || event?.metaKey
    );

    if (additive) {
      setSelectedIds((current) => (
        current.includes(item.id)
          ? current.filter((id) => id !== item.id)
          : [...current, item.id]
      ));

      setFieldId(item.id);
      return;
    }

    setSelectedIds([item.id]);
    setFieldId(item.id);
  };

  const selectAllElements = () => {
    const ids = (page?.elements || []).map(
      (item) => item.id,
    );

    setSelectedIds(ids);
    setFieldId(ids.at(-1) || null);
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setFieldId(null);
  };

  const deleteSelectedElements = () => {
    if (!page || !selectedIds.length) return;

    updatePage({
      elements: (page.elements || []).filter(
        (item) => !selectedIds.includes(item.id),
      ),
    });

    clearSelection();
  };

  const updatePages = (next) => {
    commitTemplateChange((current) => ({
      ...current,
      pages: next.map((item, index) => ({
        ...item,
        order: index,
      })),
      updatedAt: new Date().toISOString(),
    }));
  };

  const updatePage = (patch) => {
    if (!page) return;

    updatePages(
      pages.map((item) => (
        item.id === page.id
          ? { ...item, ...patch }
          : item
      )),
    );
  };

  const updateField = (patch) => {
    if (!page || !field) return;

    updatePage({
      elements: page.elements.map((item) => (
        item.id === field.id
          ? { ...item, ...patch }
          : item
      )),
    });
  };

  const updateElementById = (
    targetPageId,
    targetElementId,
    patch,
  ) => {
    commitTemplateChange((current) => ({
      ...current,
      pages: (current.pages || []).map((pageItem) => (
        pageItem.id === targetPageId
          ? {
              ...pageItem,
              elements: (pageItem.elements || []).map(
                (elementItem) => (
                  elementItem.id === targetElementId
                    ? {
                        ...elementItem,
                        ...patch,
                      }
                    : elementItem
                ),
              ),
            }
          : pageItem
      )),
      updatedAt: new Date().toISOString(),
    }));
  };

  const rememberTextSelection = () => {
    const selection = window.getSelection();

    if (
      selection
      && selection.rangeCount
      && editingTextId
    ) {
      savedSelectionRef.current =
        selection.getRangeAt(0).cloneRange();
    }
  };

  const restoreTextSelection = () => {
    const range = savedSelectionRef.current;

    if (!range) return false;

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    return true;
  };

  const applyInlineCommand = (
    command,
    value = null,
  ) => {
    if (!editingTextId) return;

    restoreTextSelection();

    document.execCommand(
      command,
      false,
      value,
    );

    rememberTextSelection();

    const editable = document.querySelector(
      `[data-rich-text-id="${editingTextId}"]`,
    );

    if (editable) {
      updateElementById(
        page.id,
        editingTextId,
        {
          htmlContent: editable.innerHTML,
          content: editable.innerText,
        },
      );
    }
  };

  const applyInlineFontSize = (size) => {
    if (!editingTextId) return;

    restoreTextSelection();
    document.execCommand('fontSize', false, '7');

    const editable = document.querySelector(
      `[data-rich-text-id="${editingTextId}"]`,
    );

    editable?.querySelectorAll('font[size="7"]')
      .forEach((node) => {
        node.removeAttribute('size');
        node.style.fontSize = `${size}px`;
      });

    rememberTextSelection();

    if (editable) {
      updateElementById(
        page.id,
        editingTextId,
        {
          htmlContent: editable.innerHTML,
          content: editable.innerText,
        },
      );
    }
  };

  const duplicateSelectedElements = () => {
    if (!page || !selectedIds.length) return;

    const copies = (page.elements || [])
      .filter((item) => selectedIds.includes(item.id))
      .map((item) => ({
        ...item,
        id: createId(item.type),
        x: Number(item.x || 0) + 12,
        y: Number(item.y || 0) + 12,
      }));

    updatePage({
      elements: [
        ...(page.elements || []),
        ...copies,
      ],
    });

    setSelectedIds(copies.map((item) => item.id));
    setFieldId(copies.at(-1)?.id || null);
  };

  const nudgeSelectedElements = (
    deltaX,
    deltaY,
  ) => {
    if (!page || !selectedIds.length) return;

    updatePage({
      elements: (page.elements || []).map(
        (item) => (
          selectedIds.includes(item.id)
            ? {
                ...item,
                x: Number(item.x || 0) + deltaX,
                y: Number(item.y || 0) + deltaY,
              }
            : item
        ),
      ),
    });
  };

  const changeSelectedLayer = (
    direction,
  ) => {
    if (!page || !selectedIds.length) return;

    const values = (page.elements || []).map(
      (item) => Number(item.zIndex || 0),
    );
    const highest = Math.max(0, ...values);
    const lowest = Math.min(0, ...values);

    updatePage({
      elements: (page.elements || []).map(
        (item) => {
          if (!selectedIds.includes(item.id)) {
            return item;
          }

          return {
            ...item,
            zIndex:
              direction === 'front'
                ? highest + 1
                : lowest - 1,
          };
        },
      ),
    });
  };

  const getSnappedPosition = ({
    x,
    y,
    width,
    height,
    pageWidth,
    pageHeight,
    elements = [],
    elementId,
  }) => {
    const tolerance = 6;

    const xPoints = [
      {
        value: 0,
        target: 'left',
      },
      {
        value: pageWidth / 2,
        target: 'center',
      },
      {
        value: pageWidth,
        target: 'right',
      },
    ];

    const yPoints = [
      {
        value: 0,
        target: 'top',
      },
      {
        value: pageHeight / 2,
        target: 'middle',
      },
      {
        value: pageHeight,
        target: 'bottom',
      },
    ];

    elements
      .filter((item) => item.id !== elementId)
      .forEach((item) => {
        const itemX = Number(item.x || 0);
        const itemY = Number(item.y || 0);
        const itemWidth = Number(item.width || 0);
        const itemHeight = Number(item.height || 0);

        xPoints.push(
          {
            value: itemX,
            target: 'element-left',
          },
          {
            value: itemX + (itemWidth / 2),
            target: 'element-center',
          },
          {
            value: itemX + itemWidth,
            target: 'element-right',
          },
        );

        yPoints.push(
          {
            value: itemY,
            target: 'element-top',
          },
          {
            value: itemY + (itemHeight / 2),
            target: 'element-middle',
          },
          {
            value: itemY + itemHeight,
            target: 'element-bottom',
          },
        );
      });

    const movingXPoints = [
      {
        value: x,
        offset: 0,
      },
      {
        value: x + (width / 2),
        offset: width / 2,
      },
      {
        value: x + width,
        offset: width,
      },
    ];

    const movingYPoints = [
      {
        value: y,
        offset: 0,
      },
      {
        value: y + (height / 2),
        offset: height / 2,
      },
      {
        value: y + height,
        offset: height,
      },
    ];

    let bestX = null;
    let bestY = null;

    movingXPoints.forEach((moving) => {
      xPoints.forEach((target) => {
        const distance = Math.abs(
          moving.value - target.value,
        );

        if (
          distance <= tolerance
          && (
            !bestX
            || distance < bestX.distance
          )
        ) {
          bestX = {
            distance,
            x: target.value - moving.offset,
            guide: target.value,
          };
        }
      });
    });

    movingYPoints.forEach((moving) => {
      yPoints.forEach((target) => {
        const distance = Math.abs(
          moving.value - target.value,
        );

        if (
          distance <= tolerance
          && (
            !bestY
            || distance < bestY.distance
          )
        ) {
          bestY = {
            distance,
            y: target.value - moving.offset,
            guide: target.value,
          };
        }
      });
    });

    return {
      x: Math.round(bestX ? bestX.x : x),
      y: Math.round(bestY ? bestY.y : y),
      vertical: bestX?.guide ?? null,
      horizontal: bestY?.guide ?? null,
    };
  };

  const centerSelectedElement = (
    axis = 'both',
  ) => {
    if (!page || !field) return;

    const patch = {};

    if (
      axis === 'horizontal'
      || axis === 'both'
    ) {
      patch.x = Math.round(
        (Number(page.width || 595.28)
        - Number(field.width || 0)) / 2,
      );
    }

    if (
      axis === 'vertical'
      || axis === 'both'
    ) {
      patch.y = Math.round(
        (Number(page.height || 841.89)
        - Number(field.height || 0)) / 2,
      );
    }

    updateField(patch);
  };

  const beginElementInteraction = (
    event,
    item,
    mode = 'move',
    handle = '',
  ) => {
    if (
      !page
      || item.locked
      || (
        mode === 'move'
        && editingTextId === item.id
      )
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setFieldId(item.id);

    event.currentTarget.setPointerCapture?.(
      event.pointerId,
    );

    const activeIds = (
      selectedIds.includes(item.id)
        ? selectedIds
        : [item.id]
    );

    const groupStart = (page.elements || [])
      .filter((elementItem) => (
        activeIds.includes(elementItem.id)
      ))
      .map((elementItem) => ({
        id: elementItem.id,
        x: Number(elementItem.x || 0),
        y: Number(elementItem.y || 0),
      }));

    interactionRef.current = {
      pointerId: event.pointerId,
      mode,
      handle,
      pageId: page.id,
      elementId: item.id,
      activeIds,
      groupStart,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: Number(item.x || 0),
      startY: Number(item.y || 0),
      startWidth: Number(item.width || 0),
      startHeight: Number(item.height || 0),
    };
  };

  const moveElementInteraction = (event) => {
    const interaction = interactionRef.current;

    if (
      !interaction
      || interaction.pointerId !== event.pointerId
    ) {
      return;
    }

    event.preventDefault();

    const deltaX = (
      event.clientX - interaction.startClientX
    ) / canvasZoom;
    const deltaY = (
      event.clientY - interaction.startClientY
    ) / canvasZoom;

    if (interaction.mode === 'move') {
      const currentPage = (
        template?.pages || []
      ).find(
        (pageItem) => (
          pageItem.id === interaction.pageId
        ),
      );

      const currentElement = (
        currentPage?.elements || []
      ).find(
        (elementItem) => (
          elementItem.id === interaction.elementId
        ),
      );

      const next = getSnappedPosition({
        x: interaction.startX + deltaX,
        y: interaction.startY + deltaY,
        width:
          Number(currentElement?.width)
          || interaction.startWidth,
        height:
          Number(currentElement?.height)
          || interaction.startHeight,
        pageWidth:
          Number(currentPage?.width)
          || 595.28,
        pageHeight:
          Number(currentPage?.height)
          || 841.89,
        elements:
          currentPage?.elements || [],
        elementId:
          interaction.elementId,
      });

      setAlignmentGuides({
        vertical: next.vertical,
        horizontal: next.horizontal,
      });

      if (
        interaction.activeIds?.length > 1
        && interaction.groupStart?.length
      ) {
        const snappedDeltaX =
          next.x - interaction.startX;
        const snappedDeltaY =
          next.y - interaction.startY;

        commitTemplateChange((current) => ({
          ...current,
          pages: (current.pages || []).map(
            (pageItem) => (
              pageItem.id === interaction.pageId
                ? {
                    ...pageItem,
                    elements: (pageItem.elements || []).map(
                      (elementItem) => {
                        const start = interaction.groupStart.find(
                          (entry) => entry.id === elementItem.id,
                        );

                        return start
                          ? {
                              ...elementItem,
                              x: Math.round(
                                start.x + snappedDeltaX,
                              ),
                              y: Math.round(
                                start.y + snappedDeltaY,
                              ),
                            }
                          : elementItem;
                      },
                    ),
                  }
                : pageItem
            ),
          ),
          updatedAt: new Date().toISOString(),
        }));
      } else {
        updateElementById(
          interaction.pageId,
          interaction.elementId,
          {
            x: next.x,
            y: next.y,
          },
        );
      }

      return;
    }

    const minimumWidth = 24;
    const minimumHeight = 18;

    let nextX = interaction.startX;
    let nextY = interaction.startY;
    let nextWidth = interaction.startWidth;
    let nextHeight = interaction.startHeight;

    if (interaction.handle.includes('e')) {
      nextWidth = Math.max(
        minimumWidth,
        interaction.startWidth + deltaX,
      );
    }

    if (interaction.handle.includes('s')) {
      nextHeight = Math.max(
        minimumHeight,
        interaction.startHeight + deltaY,
      );
    }

    if (interaction.handle.includes('w')) {
      const proposedWidth =
        interaction.startWidth - deltaX;

      if (proposedWidth >= minimumWidth) {
        nextWidth = proposedWidth;
        nextX = interaction.startX + deltaX;
      }
    }

    if (interaction.handle.includes('n')) {
      const proposedHeight =
        interaction.startHeight - deltaY;

      if (proposedHeight >= minimumHeight) {
        nextHeight = proposedHeight;
        nextY = interaction.startY + deltaY;
      }
    }

    updateElementById(
      interaction.pageId,
      interaction.elementId,
      {
        x: Math.round(nextX),
        y: Math.round(nextY),
        width: Math.round(nextWidth),
        height: Math.round(nextHeight),
      },
    );
  };

  const endElementInteraction = (event) => {
    const interaction = interactionRef.current;

    if (
      !interaction
      || interaction.pointerId !== event.pointerId
    ) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(
      event.pointerId,
    );

    interactionRef.current = null;
    setAlignmentGuides({
      vertical: null,
      horizontal: null,
    });
  };

  const resizeHandles = (item) => {
    if (
      selectedIds.length !== 1
      || item.id !== fieldId
      || item.locked
    ) {
      return null;
    }

    return [
      'nw',
      'n',
      'ne',
      'e',
      'se',
      's',
      'sw',
      'w',
    ].map((handle) => (
      <span
        key={handle}
        className={`contract-resize-handle handle-${handle}`}
        onPointerDown={(event) => {
          beginElementInteraction(
            event,
            item,
            'resize',
            handle,
          );
        }}
        onPointerMove={moveElementInteraction}
        onPointerUp={endElementInteraction}
        onPointerCancel={endElementInteraction}
      />
    ));
  };

  const addElement = (element) => {
    if (!page) return;

    const item = {
      ...element,
      pageId: page.id,
      zIndex:
        Math.max(
          0,
          ...(page.elements || []).map(
            (entry) => Number(entry.zIndex || 0),
          ),
        ) + 1,
    };

    updatePage({
      elements: [
        ...(page.elements || []),
        item,
      ],
    });

    setFieldId(item.id);
  };

  const save = async () => {
    if (!template) return;

    if (template.isPublished) {
      const draft = await createDraftVersion({
        ...template,
        status: 'draft',
      });

      setMessage(
        'Modelo publicado preservado; uma nova versão em rascunho foi criada.',
      );

      navigate(
        `/configuracoes/modelos-contratos/${draft.id}`,
        { replace: true },
      );

      return;
    }

    await saveTemplate({
      ...template,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    });

    setMessage('Modelo salvo.');
  };

  const publish = async () => {
    if (!template) return;

    const published = await publishNewVersion({
      ...template,
      status: 'published',
    });

    setMessage(
      `Versão ${published.version} publicada.`,
    );

    navigate(
      `/configuracoes/modelos-contratos/${published.id}`,
      { replace: true },
    );
  };

  const applyCompleteModel = async () => {
    if (
      !window.confirm(
        'Aplicar o modelo completo? As páginas atuais desta versão serão substituídas. As versões publicadas anteriores serão preservadas.',
      )
    ) {
      return;
    }

    const nextPages = buildContractBlueprint(
      template.category,
    );

    const nextTemplate = {
      ...template,
      pages: nextPages,
      isPublished: false,
      status: 'draft',
      metadata: {
        ...(template.metadata || {}),
        blueprintVersion:
          CONTRACT_BLUEPRINT_VERSION,
        generatedInsideEditor: true,
        editableText: true,
        supportsLogo: true,
      },
      updatedAt: new Date().toISOString(),
    };

    const saved = template.isPublished
      ? await createDraftVersion(nextTemplate)
      : await saveTemplate(nextTemplate);

    setTemplate(saved);
    setPageId(saved.pages?.[0]?.id || null);
    setFieldId(null);
    setMessage(
      'Modelo completo aplicado. Revise os textos, adicione sua logomarca e publique a nova versão.',
    );

    if (saved.id !== template.id) {
      navigate(
        `/configuracoes/modelos-contratos/${saved.id}`,
        { replace: true },
      );
    }
  };

  const uploadImage = (event) => {
    const file = event.target.files?.[0];

    if (!file || !field) return;

    const reader = new FileReader();

    reader.onload = () => {
      updateField({
        src: String(reader.result || ''),
      });
    };

    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const uploadPageBackground = (event) => {
    const file = event.target.files?.[0];

    if (!file || !page) return;

    const reader = new FileReader();

    reader.onload = () => {
      updatePage({
        background: {
          ...(page.background || {}),
          type: 'image',
          url: String(reader.result || ''),
          opacity: 1,
        },
      });
    };

    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const editCanvasText = (item) => {
    if (
      item.locked
      || item.type !== 'text'
    ) {
      return;
    }

    setEditingTextId(item.id);
    setSelectedIds([item.id]);
    setFieldId(item.id);

    requestAnimationFrame(() => {
      const editable = document.querySelector(
        `[data-rich-text-id="${item.id}"]`,
      );

      editable?.focus();
    });
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTyping = (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target?.isContentEditable
      );

      if (isTyping) return;

      if (
        (event.ctrlKey || event.metaKey)
        && event.key.toLowerCase() === 'z'
      ) {
        event.preventDefault();

        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }

        return;
      }

      if (
        (event.ctrlKey || event.metaKey)
        && event.key.toLowerCase() === 'y'
      ) {
        event.preventDefault();
        redo();
        return;
      }

      if (
        (event.ctrlKey || event.metaKey)
        && event.key.toLowerCase() === 'd'
      ) {
        event.preventDefault();
        duplicateSelectedElements();
        return;
      }

      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
          .includes(event.key)
        && selectedIds.length
      ) {
        event.preventDefault();

        const amount = event.shiftKey ? 10 : 1;

        nudgeSelectedElements(
          event.key === 'ArrowLeft'
            ? -amount
            : event.key === 'ArrowRight'
              ? amount
              : 0,
          event.key === 'ArrowUp'
            ? -amount
            : event.key === 'ArrowDown'
              ? amount
              : 0,
        );

        return;
      }

      if (
        (event.ctrlKey || event.metaKey)
        && event.key.toLowerCase() === 'a'
      ) {
        event.preventDefault();
        selectAllElements();
        return;
      }

      if (
        event.key === 'Delete'
        || event.key === 'Backspace'
      ) {
        event.preventDefault();
        deleteSelectedElements();
        return;
      }

      if (event.key === 'Escape') {
        setEditingTextId(null);
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    pageId,
    selectedIds,
    template,
  ]);

  if (loading) {
    return <p>Carregando editor...</p>;
  }

  if (!template) {
    return (
      <div className="editor-empty">
        <p>Modelo não encontrado.</p>
        <button
          type="button"
          onClick={() => {
            navigate('/configuracoes/modelos-contratos');
          }}
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <section className="contract-template-editor">
      <header>
        <button
          type="button"
          onClick={() => {
            navigate('/configuracoes/modelos-contratos');
          }}
        >
          <ArrowLeft />
          Voltar
        </button>

        <div>
          <input
            value={template.name}
            onChange={(event) => {
              setTemplate({
                ...template,
                name: event.target.value,
              });
            }}
          />

          <span>
            {template.category}
            {' · '}
            v{template.version}
            {' · '}
            {template.isPublished
              ? 'Publicado'
              : 'Rascunho'}
          </span>
        </div>

        <button
          type="button"
          onClick={undo}
          disabled={!history.past.length}
          title="Desfazer (Ctrl+Z)"
        >
          <Undo2 />
          Desfazer
        </button>

        <button
          type="button"
          onClick={redo}
          disabled={!history.future.length}
          title="Refazer (Ctrl+Shift+Z)"
        >
          <Redo2 />
          Refazer
        </button>

        <button
          type="button"
          className="apply-blueprint"
          onClick={applyCompleteModel}
        >
          <FileImage />
          Aplicar modelo completo
        </button>

        <button
          type="button"
          onClick={save}
        >
          <Save />
          Salvar
        </button>

        <button
          type="button"
          className="publish"
          onClick={publish}
        >
          Publicar nova versão
        </button>
      </header>

      <nav className="contract-mobile-tabs">
        {['pages', 'canvas', 'fields'].map((tab) => (
          <button
            type="button"
            key={tab}
            className={
              mobileTab === tab
                ? 'active'
                : ''
            }
            onClick={() => {
              setMobileTab(tab);
            }}
          >
            {tab === 'pages'
              ? 'Páginas'
              : tab === 'canvas'
                ? 'Visualização'
                : 'Elementos'}
          </button>
        ))}
      </nav>

      <div className="contract-editor-grid">
        <aside
          className={`contract-pages ${
            mobileTab === 'pages'
              ? 'mobile-active'
              : ''
          }`}
        >
          <button
            type="button"
            onClick={() => {
              const item = newPage(pages.length);

              updatePages([...pages, item]);
              setPageId(item.id);
              setFieldId(null);
            }}
          >
            <FilePlus2 />
            Adicionar página
          </button>

          {pages.map((item, index) => (
            <article
              key={item.id}
              className={
                item.id === pageId
                  ? 'active'
                  : ''
              }
              onClick={() => {
                setPageId(item.id);
                setFieldId(null);
                setSelectedIds([]);
              }}
            >
              <span>{index + 1}</span>

              <input
                value={item.name}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onChange={(event) => {
                  updatePages(
                    pages.map((entry) => (
                      entry.id === item.id
                        ? {
                            ...entry,
                            name: event.target.value,
                          }
                        : entry
                    )),
                  );
                }}
              />

              <input
                aria-label="Ativar página"
                type="checkbox"
                checked={item.active}
                onChange={(event) => {
                  updatePages(
                    pages.map((entry) => (
                      entry.id === item.id
                        ? {
                            ...entry,
                            active:
                              event.target.checked,
                          }
                        : entry
                    )),
                  );
                }}
              />

              <div>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={(event) => {
                    event.stopPropagation();

                    const next = [...pages];

                    [
                      next[index - 1],
                      next[index],
                    ] = [
                      next[index],
                      next[index - 1],
                    ];

                    updatePages(next);
                  }}
                >
                  <ArrowUp />
                </button>

                <button
                  type="button"
                  disabled={
                    index === pages.length - 1
                  }
                  onClick={(event) => {
                    event.stopPropagation();

                    const next = [...pages];

                    [
                      next[index + 1],
                      next[index],
                    ] = [
                      next[index],
                      next[index + 1],
                    ];

                    updatePages(next);
                  }}
                >
                  <ArrowDown />
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();

                    const copy = {
                      ...item,
                      id: createId('page'),
                      name: `${item.name} cópia`,
                      elements: (
                        item.elements || []
                      ).map((element) => ({
                        ...element,
                        id: createId(element.type),
                      })),
                    };

                    updatePages([
                      ...pages.slice(0, index + 1),
                      copy,
                      ...pages.slice(index + 1),
                    ]);
                  }}
                >
                  <Copy />
                </button>

                <button
                  type="button"
                  disabled={pages.length === 1}
                  onClick={(event) => {
                    event.stopPropagation();

                    const next = pages.filter(
                      (entry) => entry.id !== item.id,
                    );

                    updatePages(next);

                    if (item.id === pageId) {
                      setPageId(next[0]?.id || null);
                      setFieldId(null);
                    }
                  }}
                >
                  <Trash2 />
                </button>
              </div>
            </article>
          ))}
        </aside>

        <main
          className={`contract-a4-stage ${
            mobileTab === 'canvas'
              ? 'mobile-active'
              : ''
          }`}
        >
          <div className="contract-canvas-toolbar">
            <button
              type="button"
              onClick={() => {
                setCanvasZoom((current) => (
                  Math.max(0.5, Number((current - 0.1).toFixed(1)))
                ));
              }}
            >
              −
            </button>
            <span>{Math.round(canvasZoom * 100)}%</span>
            <button
              type="button"
              onClick={() => {
                setCanvasZoom((current) => (
                  Math.min(1.5, Number((current + 0.1).toFixed(1)))
                ));
              }}
            >
              +
            </button>
            <button
              type="button"
              onClick={() => {
                setCanvasZoom(1);
              }}
            >
              100%
            </button>

            <span className="contract-toolbar-divider" />

            <button
              type="button"
              onClick={selectAllElements}
            >
              Selecionar tudo
            </button>

            <button
              type="button"
              disabled={!selectedIds.length}
              onClick={deleteSelectedElements}
            >
              <Trash2 />
              Apagar
            </button>
          </div>

          <div
            className="contract-a4"
            style={{
              transform: `scale(${canvasZoom})`,
              transformOrigin: 'top center',
              background:
                page?.background?.type === 'color'
                  ? page.background.color
                    || '#fffdf9'
                  : '#fffdf9',
              backgroundImage:
                ['image', 'pdf'].includes(
                  page?.background?.type,
                )
                && page?.background?.url
                  ? `url("${page.background.url}")`
                  : 'none',
            }}
          >
            {alignmentGuides.vertical !== null && (
              <div
                className="contract-alignment-guide vertical"
                style={{
                  left: alignmentGuides.vertical,
                }}
              />
            )}

            {alignmentGuides.horizontal !== null && (
              <div
                className="contract-alignment-guide horizontal"
                style={{
                  top: alignmentGuides.horizontal,
                }}
              />
            )}

            {editingTextId && field && (
              <div
                className="contract-inline-text-toolbar"
                style={{
                  left: Math.max(
                    8,
                    Math.min(
                      Number(field.x || 0),
                      310,
                    ),
                  ),
                  top: Math.max(
                    8,
                    Number(field.y || 0) - 52,
                  ),
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
              >
                <select
                  defaultValue={field.fontFamily || 'Helvetica'}
                  onChange={(event) => {
                    applyInlineCommand(
                      'fontName',
                      event.target.value,
                    );
                  }}
                  title="Fonte da seleção"
                >
                  <option value="Helvetica">Helvetica</option>
                  <option value="Arial">Arial</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Garamond">Garamond</option>
                  <option value="Baskerville">Baskerville</option>
                </select>

                <input
                  type="number"
                  min="6"
                  max="96"
                  defaultValue={field.fontSize || 12}
                  onChange={(event) => {
                    applyInlineFontSize(
                      Number(event.target.value),
                    );
                  }}
                  title="Tamanho da seleção"
                />

                <button
                  type="button"
                  onClick={() => {
                    applyInlineCommand('bold');
                  }}
                  title="Negrito"
                >
                  <Bold />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    applyInlineCommand('italic');
                  }}
                  title="Itálico"
                >
                  <Italic />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    applyInlineCommand('underline');
                  }}
                  title="Sublinhado"
                >
                  <Underline />
                </button>

                <input
                  type="color"
                  defaultValue={field.color || '#222222'}
                  onChange={(event) => {
                    applyInlineCommand(
                      'foreColor',
                      event.target.value,
                    );
                  }}
                  title="Cor da seleção"
                />

                <button
                  type="button"
                  onClick={() => {
                    applyInlineCommand('justifyLeft');
                  }}
                  title="Alinhar à esquerda"
                >
                  <AlignLeft />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    applyInlineCommand('justifyCenter');
                  }}
                  title="Centralizar"
                >
                  <AlignCenter />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    applyInlineCommand('justifyRight');
                  }}
                  title="Alinhar à direita"
                >
                  <AlignRight />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditingTextId(null);
                  }}
                >
                  Concluir
                </button>
              </div>
            )}

            {(page?.elements || [])
              .filter((item) => item.visible)
              .sort(
                (first, second) => (
                  Number(first.zIndex || 0)
                  - Number(second.zIndex || 0)
                ),
              )
              .map((item) => {
                const commonStyle = {
                  left: item.x,
                  top: item.y,
                  width: item.width,
                  height: item.height,
                  opacity: item.opacity,
                  zIndex: item.zIndex,
                  transform:
                    `rotate(${item.rotation || 0}deg)`,
                };

                if (
                  item.type === 'logo'
                  || item.type === 'image'
                ) {
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      className={`contract-canvas-element image-element ${
                        item.metadata?.role
                          ? `role-${item.metadata.role} `
                          : ''
                      }${
                        selectedIds.includes(item.id)
                          ? 'selected'
                          : ''
                      }`}
                      onClick={(event) => {
                        selectElement(item, event);
                      }}
                      onPointerDown={(event) => {
                        beginElementInteraction(
                          event,
                          item,
                          'move',
                        );
                      }}
                      onPointerMove={moveElementInteraction}
                      onPointerUp={endElementInteraction}
                      onPointerCancel={endElementInteraction}
                      style={commonStyle}
                    >
                      {item.src ? (
                        <img
                          src={item.src}
                          alt={item.alt || ''}
                          draggable="false"
                          style={{
                            objectFit:
                              item.objectFit || 'contain',
                            objectPosition:
                              `${item.objectPositionX ?? 50}% ${
                                item.objectPositionY ?? 50
                              }%`,
                            transform:
                              `scale(${item.imageScale || 1})`,
                            transformOrigin: 'center',
                          }}
                        />
                      ) : (
                        <span>
                          <ImagePlus />
                          {item.type === 'logo'
                            ? 'Adicionar logomarca'
                            : 'Adicionar imagem'}
                        </span>
                      )}
                      {resizeHandles(item)}
                    </div>
                  );
                }

                if (item.type === 'overlay') {
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      aria-label="Forma"
                      className={`contract-canvas-element overlay-element ${
                        item.metadata?.role
                          ? `role-${item.metadata.role} `
                          : ''
                      }${
                        selectedIds.includes(item.id)
                          ? 'selected'
                          : ''
                      }`}
                      onClick={(event) => {
                        selectElement(item, event);
                      }}
                      onPointerDown={(event) => {
                        beginElementInteraction(
                          event,
                          item,
                          'move',
                        );
                      }}
                      onPointerMove={moveElementInteraction}
                      onPointerUp={endElementInteraction}
                      onPointerCancel={endElementInteraction}
                      style={{
                        ...commonStyle,
                        backgroundColor:
                          item.backgroundColor,
                        border:
                          `${item.borderWidth || 0}px solid ${
                            item.borderColor
                            || 'transparent'
                          }`,
                        borderRadius:
                          item.borderRadius || 0,
                      }}
                    >
                      {resizeHandles(item)}
                    </div>
                  );
                }

                const content = item.type === 'text'
                  ? item.content
                  : item.label
                    ? `${item.label}: {{${item.placeholderKey}}}`
                    : `{{${item.placeholderKey}}}`;

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className={`contract-canvas-element text-element ${
                      item.metadata?.role
                        ? `role-${item.metadata.role} `
                        : ''
                    }${
                      selectedIds.includes(item.id)
                        ? 'selected'
                        : ''
                    }`}
                    onClick={(event) => {
                      selectElement(item, event);
                    }}
                    onDoubleClick={() => {
                      editCanvasText(item);
                    }}
                    onPointerDown={(event) => {
                      beginElementInteraction(
                        event,
                        item,
                        'move',
                      );
                    }}
                    onPointerMove={moveElementInteraction}
                    onPointerUp={endElementInteraction}
                    onPointerCancel={endElementInteraction}
                    title={
                      item.type === 'text'
                        ? 'Clique para selecionar. Clique duas vezes para editar.'
                        : 'Clique para selecionar. Clique duas vezes para editar o rótulo.'
                    }
                    style={{
                      ...commonStyle,
                      fontFamily: item.fontFamily,
                      fontSize: item.fontSize,
                      fontWeight: item.fontWeight,
                      fontStyle:
                        item.fontStyle || 'normal',
                      textDecoration:
                        item.textDecoration || 'none',
                      color: item.color,
                      textAlign: item.align,
                      lineHeight: item.lineHeight,
                      letterSpacing:
                        item.letterSpacing,
                    }}
                  >
                    {item.type === 'text' ? (
                      <div
                        className="contract-rich-text-content"
                        data-rich-text-id={item.id}
                        contentEditable={
                          editingTextId === item.id
                        }
                        suppressContentEditableWarning
                        onMouseUp={rememberTextSelection}
                        onKeyUp={rememberTextSelection}
                        onInput={(event) => {
                          updateElementById(
                            page.id,
                            item.id,
                            {
                              htmlContent:
                                event.currentTarget.innerHTML,
                              content:
                                event.currentTarget.innerText,
                            },
                          );
                        }}
                        onBlur={() => {
                          rememberTextSelection();
                        }}
                        dangerouslySetInnerHTML={{
                          __html:
                            item.htmlContent
                            || String(item.content || '')
                              .replace(/\n/g, '<br>'),
                        }}
                      />
                    ) : (
                      content
                    )}

                    {resizeHandles(item)}
                  </div>
                );
              })}
          </div>
        </main>

        <aside
          className={`contract-field-panel ${
            mobileTab === 'fields'
              ? 'mobile-active'
              : ''
          }`}
        >
          <div className="contract-selection-summary">
            <h2>Configurações</h2>

            {selectedIds.length > 1 && (
              <span>
                {selectedIds.length} elementos selecionados
              </span>
            )}
          </div>

          <section className="contract-page-settings">
            <h3>Página</h3>

            <label>
              Fundo
              <select
                value={
                  page?.background?.type || 'color'
                }
                onChange={(event) => {
                  updatePage({
                    background: {
                      ...(page.background || {}),
                      type: event.target.value,
                    },
                  });
                }}
              >
                <option value="color">Cor</option>
                <option value="none">Sem fundo</option>
                <option value="image">Imagem</option>
                <option value="pdf">PDF original</option>
              </select>
            </label>

            {page?.background?.type === 'color' && (
              <label>
                Cor do fundo
                <input
                  type="color"
                  value={
                    page.background.color
                    || '#fffdf9'
                  }
                  onChange={(event) => {
                    updatePage({
                      background: {
                        ...page.background,
                        color: event.target.value,
                      },
                    });
                  }}
                />
              </label>
            )}

            {['image', 'pdf'].includes(
              page?.background?.type,
            ) && (
              <label>
                URL do fundo
                <input
                  value={
                    page.background.url || ''
                  }
                  onChange={(event) => {
                    updatePage({
                      background: {
                        ...page.background,
                        url: event.target.value,
                      },
                    });
                  }}
                  placeholder="/imagem-ou-pdf.png"
                />
              </label>
            )}

            <label className="contract-upload-label">
              Colocar imagem no fundo da página
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={uploadPageBackground}
              />
            </label>

            {page?.background?.url && (
              <button
                type="button"
                onClick={() => {
                  updatePage({
                    background: {
                      ...(page.background || {}),
                      type: 'color',
                      url: null,
                    },
                  });
                }}
              >
                Remover imagem de fundo
              </button>
            )}
          </section>

          <section className="contract-add-elements">
            <h3>Adicionar</h3>

            <div>
              <button
                type="button"
                onClick={() => {
                  addElement(newText());
                }}
              >
                <Type />
                Texto
              </button>

              <button
                type="button"
                onClick={() => {
                  addElement(newDynamicField());
                }}
              >
                <Plus />
                Campo
              </button>

              <button
                type="button"
                onClick={() => {
                  addElement(newLogo());
                }}
              >
                <ImagePlus />
                Logomarca
              </button>

              <button
                type="button"
                onClick={() => {
                  addElement(newRectangle());
                }}
              >
                <Plus />
                Retângulo
              </button>

              <button
                type="button"
                onClick={() => {
                  addElement(newSquare());
                }}
              >
                <Square />
                Quadrado
              </button>

              <button
                type="button"
                onClick={() => {
                  addElement(newCircle());
                }}
              >
                <Circle />
                Círculo
              </button>
            </div>
          </section>

          <div className="contract-field-list">
            {(page?.elements || []).map((item) => (
              <button
                type="button"
                key={item.id}
                className={
                  selectedIds.includes(item.id)
                    ? 'active'
                    : ''
                }
                onClick={(event) => {
                  selectElement(item, event);
                }}
              >
                {getElementLabel(item)}
              </button>
            ))}
          </div>

          {selectedIds.length > 1 && (
            <div className="contract-bulk-actions">
              <button
                type="button"
                onClick={() => {
                  const selected = selectedElements;
                  if (!selected.length) return;

                  const minX = Math.min(
                    ...selected.map((item) => Number(item.x || 0)),
                  );
                  const maxRight = Math.max(
                    ...selected.map((item) => (
                      Number(item.x || 0)
                      + Number(item.width || 0)
                    )),
                  );
                  const groupWidth = maxRight - minX;
                  const targetX = (
                    (Number(page.width || 595.28) - groupWidth) / 2
                  );
                  const delta = targetX - minX;

                  commitTemplateChange((current) => ({
                    ...current,
                    pages: (current.pages || []).map(
                      (pageItem) => (
                        pageItem.id === page.id
                          ? {
                              ...pageItem,
                              elements: (pageItem.elements || []).map(
                                (elementItem) => (
                                  selectedIds.includes(elementItem.id)
                                    ? {
                                        ...elementItem,
                                        x: Math.round(
                                          Number(elementItem.x || 0) + delta,
                                        ),
                                      }
                                    : elementItem
                                ),
                              ),
                            }
                          : pageItem
                      ),
                    ),
                  }));
                }}
              >
                Centralizar grupo
              </button>

              <button
                type="button"
                className="danger"
                onClick={deleteSelectedElements}
              >
                <Trash2 />
                Apagar selecionados
              </button>
            </div>
          )}

          {field && selectedIds.length === 1 && (
            <div className="contract-field-properties">
              <h3>Elemento selecionado</h3>

              {field.type === 'text' && (
                <>
                  <label>
                    Texto
                    <textarea
                      rows="8"
                      value={field.content || ''}
                      onChange={(event) => {
                        updateField({
                          content: event.target.value,
                        });
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      updateField({
                        type: 'dynamicField',
                        placeholderKey:
                          'client.name',
                        label:
                          field.content || 'Nome',
                        hideIfEmpty: true,
                      });
                    }}
                  >
                    <Plus />
                    Converter em campo automático
                  </button>
                </>
              )}

              {field.type === 'dynamicField' && (
                <>
                  <label>
                    Campo automático
                    <select
                      value={field.placeholderKey}
                      onChange={(event) => {
                        updateField({
                          placeholderKey:
                            event.target.value,
                        });
                      }}
                    >
                      {CONTRACT_FIELD_OPTIONS.map(
                        (item) => (
                          <option
                            key={item}
                            value={item}
                          >
                            {item}
                          </option>
                        ),
                      )}
                    </select>
                  </label>

                  <label>
                    Rótulo exibido
                    <input
                      value={field.label || ''}
                      onChange={(event) => {
                        updateField({
                          label: event.target.value,
                        });
                      }}
                      placeholder="Ex.: Nome"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      updateField({
                        type: 'text',
                        content:
                          field.label
                            ? `${field.label}: `
                            : 'Texto editável',
                        hideIfEmpty: false,
                      });
                    }}
                  >
                    <Type />
                    Converter em texto editável
                  </button>
                </>
              )}

              {['logo', 'image'].includes(field.type) && (
                <>
                  <label>
                    URL da imagem
                    <input
                      value={field.src || ''}
                      onChange={(event) => {
                        updateField({
                          src: event.target.value,
                        });
                      }}
                      placeholder="/minha-logomarca.png"
                    />
                  </label>

                  <label className="contract-upload-label">
                    Carregar arquivo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={uploadImage}
                    />
                  </label>

                  <label>
                    Ajuste
                    <select
                      value={
                        field.objectFit || 'contain'
                      }
                      onChange={(event) => {
                        updateField({
                          objectFit:
                            event.target.value,
                        });
                      }}
                    >
                      <option value="contain">
                        Mostrar imagem inteira
                      </option>
                      <option value="cover">
                        Preencher a área
                      </option>
                    </select>
                  </label>

                  <label>
                    Tamanho interno da imagem
                    <input
                      type="range"
                      min="0.2"
                      max="3"
                      step="0.05"
                      value={field.imageScale || 1}
                      onChange={(event) => {
                        updateField({
                          imageScale: Number(
                            event.target.value,
                          ),
                        });
                      }}
                    />
                    <span>
                      {Math.round(
                        (field.imageScale || 1) * 100,
                      )}%
                    </span>
                  </label>

                  <label>
                    Posição horizontal
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={
                        field.objectPositionX ?? 50
                      }
                      onChange={(event) => {
                        updateField({
                          objectPositionX: Number(
                            event.target.value,
                          ),
                        });
                      }}
                    />
                  </label>

                  <label>
                    Posição vertical
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={
                        field.objectPositionY ?? 50
                      }
                      onChange={(event) => {
                        updateField({
                          objectPositionY: Number(
                            event.target.value,
                          ),
                        });
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      updateField({
                        objectFit: 'contain',
                        objectPositionX: 50,
                        objectPositionY: 50,
                        imageScale: 1,
                      });
                    }}
                  >
                    Ajustar imagem inteira
                  </button>
                </>
              )}

              <section className="contract-element-actions">
                <h3>Organização</h3>

                <div>
                  <button
                    type="button"
                    onClick={duplicateSelectedElements}
                    title="Duplicar (Ctrl+D)"
                  >
                    <Copy />
                    Duplicar
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      changeSelectedLayer('front');
                    }}
                    title="Trazer para frente"
                  >
                    <BringToFront />
                    Frente
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      changeSelectedLayer('back');
                    }}
                    title="Enviar para trás"
                  >
                    <SendToBack />
                    Atrás
                  </button>
                </div>
              </section>

              <section className="contract-position-tools">
                <h3>Alinhamento na página</h3>

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      centerSelectedElement('horizontal');
                    }}
                  >
                    Centralizar horizontal
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      centerSelectedElement('vertical');
                    }}
                  >
                    Centralizar vertical
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      centerSelectedElement('both');
                    }}
                  >
                    Centralizar na página
                  </button>
                </div>
              </section>

              {field.type === 'overlay' && (
                <>
                  <label>
                    Cor do fundo
                    <input
                      type="color"
                      value={
                        field.backgroundColor
                        || '#f2d5c1'
                      }
                      onChange={(event) => {
                        updateField({
                          backgroundColor:
                            event.target.value,
                        });
                      }}
                    />
                  </label>

                  <label>
                    Cor da borda
                    <input
                      type="color"
                      value={
                        field.borderColor
                        || '#c89f84'
                      }
                      onChange={(event) => {
                        updateField({
                          borderColor:
                            event.target.value,
                        });
                      }}
                    />
                  </label>

                  <label>
                    Espessura da borda
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={field.borderWidth || 0}
                      onChange={(event) => {
                        updateField({
                          borderWidth: Number(
                            event.target.value,
                          ),
                        });
                      }}
                    />
                  </label>

                  <label>
                    Arredondamento
                    <input
                      type="number"
                      min="0"
                      max="300"
                      value={field.borderRadius || 0}
                      onChange={(event) => {
                        updateField({
                          borderRadius: Number(
                            event.target.value,
                          ),
                        });
                      }}
                    />
                  </label>
                </>
              )}

              {[
                ['x', 'X'],
                ['y', 'Y'],
                ['width', 'Largura'],
                ['height', 'Altura'],
                ['rotation', 'Rotação'],
                ['zIndex', 'Camada'],
                ['opacity', 'Opacidade'],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    step={
                      key === 'opacity'
                        ? '.1'
                        : '1'
                    }
                    value={field[key] ?? 0}
                    onChange={(event) => {
                      updateField({
                        [key]: Number(
                          event.target.value,
                        ),
                      });
                    }}
                  />
                </label>
              ))}

              {['text', 'dynamicField'].includes(
                field.type,
              ) && (
                <>
                  <label>
                    Fonte
                    <select
                      value={
                        field.fontFamily
                        || 'Helvetica'
                      }
                      onChange={(event) => {
                        updateField({
                          fontFamily:
                            event.target.value,
                        });
                      }}
                    >
                      <option value="Helvetica">
                        Helvetica
                      </option>
                      <option value="Arial">
                        Arial
                      </option>
                      <option value="Georgia">
                        Georgia
                      </option>
                      <option value="Times New Roman">
                        Times New Roman
                      </option>
                      <option value="Garamond">
                        Garamond
                      </option>
                      <option value="Palatino Linotype">
                        Palatino
                      </option>
                      <option value="Baskerville">
                        Baskerville
                      </option>
                      <option value="Trebuchet MS">
                        Trebuchet
                      </option>
                      <option value="Verdana">
                        Verdana
                      </option>
                      <option value="Courier New">
                        Courier New
                      </option>
                    </select>
                  </label>

                  <label>
                    Tamanho
                    <input
                      type="number"
                      min="6"
                      max="96"
                      value={field.fontSize || 12}
                      onChange={(event) => {
                        updateField({
                          fontSize: Number(
                            event.target.value,
                          ),
                        });
                      }}
                    />
                  </label>

                  <div className="contract-text-formatting">
                    <button
                      type="button"
                      className={
                        field.fontWeight === '700'
                          ? 'active'
                          : ''
                      }
                      onClick={() => {
                        updateField({
                          fontWeight:
                            field.fontWeight === '700'
                              ? '400'
                              : '700',
                        });
                      }}
                      title="Negrito"
                    >
                      <Bold />
                    </button>

                    <button
                      type="button"
                      className={
                        field.fontStyle === 'italic'
                          ? 'active'
                          : ''
                      }
                      onClick={() => {
                        updateField({
                          fontStyle:
                            field.fontStyle === 'italic'
                              ? 'normal'
                              : 'italic',
                        });
                      }}
                      title="Itálico"
                    >
                      <Italic />
                    </button>

                    <button
                      type="button"
                      className={
                        field.textDecoration === 'underline'
                          ? 'active'
                          : ''
                      }
                      onClick={() => {
                        updateField({
                          textDecoration:
                            field.textDecoration === 'underline'
                              ? 'none'
                              : 'underline',
                        });
                      }}
                      title="Sublinhado"
                    >
                      <Underline />
                    </button>
                  </div>

                  <div className="contract-text-case">
                    <button
                      type="button"
                      onClick={() => {
                        updateField({
                          content:
                            String(field.content || '')
                              .toLocaleUpperCase('pt-BR'),
                        });
                      }}
                      disabled={field.type !== 'text'}
                    >
                      MAIÚSCULO
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        updateField({
                          content:
                            String(field.content || '')
                              .toLocaleLowerCase('pt-BR'),
                        });
                      }}
                      disabled={field.type !== 'text'}
                    >
                      minúsculo
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        updateField({
                          content:
                            String(field.content || '')
                              .toLocaleLowerCase('pt-BR')
                              .replace(
                                /(^|[.!?]\s+)(\p{L})/gu,
                                (_, before, letter) => (
                                  `${before}${letter.toLocaleUpperCase('pt-BR')}`
                                ),
                              ),
                        });
                      }}
                      disabled={field.type !== 'text'}
                    >
                      Frase
                    </button>
                  </div>

                  <div className="contract-text-alignment">
                    {[
                      ['left', AlignLeft, 'Esquerda'],
                      ['center', AlignCenter, 'Centro'],
                      ['right', AlignRight, 'Direita'],
                      ['justify', AlignJustify, 'Justificado'],
                    ].map(([
                      value,
                      Icon,
                      label,
                    ]) => (
                      <button
                        type="button"
                        key={value}
                        className={
                          (field.align || 'left') === value
                            ? 'active'
                            : ''
                        }
                        onClick={() => {
                          updateField({
                            align: value,
                          });
                        }}
                        title={label}
                      >
                        <Icon />
                      </button>
                    ))}
                  </div>

                  <label>
                    Espaçamento entre linhas
                    <input
                      type="number"
                      min="0.8"
                      max="3"
                      step="0.05"
                      value={field.lineHeight || 1.4}
                      onChange={(event) => {
                        updateField({
                          lineHeight: Number(
                            event.target.value,
                          ),
                        });
                      }}
                    />
                  </label>

                  <label>
                    Espaçamento entre letras
                    <input
                      type="number"
                      min="-2"
                      max="12"
                      step="0.1"
                      value={field.letterSpacing || 0}
                      onChange={(event) => {
                        updateField({
                          letterSpacing: Number(
                            event.target.value,
                          ),
                        });
                      }}
                    />
                  </label>

                  <label>
                    Cor
                    <input
                      type="color"
                      value={
                        field.color || '#222222'
                      }
                      onChange={(event) => {
                        updateField({
                          color: event.target.value,
                        });
                      }}
                    />
                  </label>
                </>
              )}

              <label className="contract-visible-toggle">
                <input
                  type="checkbox"
                  checked={field.visible !== false}
                  onChange={(event) => {
                    updateField({
                      visible: event.target.checked,
                    });
                  }}
                />
                Exibir elemento
              </label>

              <button
                type="button"
                onClick={() => {
                  updateField({
                    locked: !field.locked,
                  });
                }}
              >
                {field.locked
                  ? <Unlock />
                  : <Lock />}
                {field.locked
                  ? 'Desbloquear'
                  : 'Bloquear posição'}
              </button>

              <button
                type="button"
                className="danger"
                onClick={() => {
                  updatePage({
                    elements: page.elements.filter(
                      (item) => item.id !== field.id,
                    ),
                  });

                  setFieldId(null);
                }}
              >
                <Trash2 />
                Remover elemento
              </button>
            </div>
          )}
        </aside>
      </div>

      {message && (
        <div className="contract-editor-message">
          {message}
        </div>
      )}
    </section>
  );
}