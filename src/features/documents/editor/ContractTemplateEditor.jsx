import {
  useCallback,
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
  ArrowRight,
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
  List,
  ListOrdered,
  IndentDecrease,
  IndentIncrease,
  Lock,
  Minus,
  Plus,
  Save,
  SendToBack,
  Square,
  Trash2,
  Type,
  Undo2,
  Underline,
  Strikethrough,
  Unlock,
} from 'lucide-react';
import QRCode from 'qrcode';
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
import EditorToolbar from './EditorToolbar';
import MobileTabs from './MobileTabs';
import PagesPanel from './PagesPanel';
import LayersPanel from './LayersPanel';
import EditorWorkspaceToolbar from './EditorWorkspaceToolbar';
import useEditorAutosave from './hooks/useEditorAutosave';
import { alignElements, distributeElements } from './utils/alignmentUtils';
import SelectionBox from './SelectionBox';
import {
  cloneSelectedElements,
  elementIntersectsRect,
  expandIdsWithGroups,
  getGroupedElementIds,
  normalizeRect,
} from './utils/editorCommands';
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

const newLine = (arrow = false) => ({
  ...baseElement(arrow ? 'arrow' : 'line'),
  width: 220,
  height: 24,
  strokeColor: '#2b2b2b',
  strokeWidth: 2,
  strokeStyle: 'solid',
  arrowEnd: arrow,
});

const newPolygon = () => ({
  ...baseElement('polygon'),
  width: 160,
  height: 140,
  backgroundColor: '#f2d5c1',
  borderColor: '#c89f84',
  borderWidth: 1,
  sides: 6,
});

const newSignature = () => ({
  ...baseElement('signature'),
  width: 250,
  height: 90,
  content: 'Assinatura',
  color: '#222222',
  lineColor: '#6b625b',
});

const newQrCode = (src, value) => ({
  ...baseElement('qrcode'),
  width: 150,
  height: 150,
  src,
  value,
  alt: 'QR Code',
  preserveAspectRatio: true,
});


const loadImageFromSource = (source) => new Promise(
  (resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  },
);

const trimTransparentImage = async (source) => {
  const image = await loadImageFromSource(source);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  });

  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  context.drawImage(
    image,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const imageData = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const { data } = imageData;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const alpha = data[
        ((y * canvas.width) + x) * 4 + 3
      ];

      if (alpha > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (
    maxX < minX
    || maxY < minY
  ) {
    return {
      src: source,
      width: canvas.width,
      height: canvas.height,
    };
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const trimmedCanvas =
    document.createElement('canvas');
  const trimmedContext =
    trimmedCanvas.getContext('2d');

  trimmedCanvas.width = width;
  trimmedCanvas.height = height;

  trimmedContext.drawImage(
    canvas,
    minX,
    minY,
    width,
    height,
    0,
    0,
    width,
    height,
  );

  return {
    src: trimmedCanvas.toDataURL('image/png'),
    width,
    height,
  };
};

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
  const [viewOptions, setViewOptions] = useState({ grid: false, rulers: false, margins: true });
  const [alignmentGuides, setAlignmentGuides] = useState({
    vertical: null,
    horizontal: null,
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingTextId, setEditingTextId] = useState(null);
  const [selectionRect, setSelectionRect] = useState(null);
  const [history, setHistory] = useState({
    past: [],
    future: [],
  });
  const interactionRef = useRef(null);
  const stageRef = useRef(null);
  const marqueeRef = useRef(null);
  const clipboardRef = useRef([]);
  const skipHistoryRef = useRef(false);
  const savedSelectionRef = useRef(null);
  const templateRef = useRef(null);
  const historyRef = useRef({
    past: [],
    future: [],
  });

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
      templateRef.current = data;
      setPageId(data?.pages?.[0]?.id || null);
      setSelectedIds([]);

      const emptyHistory = {
        past: [],
        future: [],
      };

      historyRef.current = emptyHistory;
      setHistory(emptyHistory);
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

  const commitTemplateChange = (
    updater,
    options = {},
  ) => {
    const current = templateRef.current;

    if (!current) return;

    const next = typeof updater === 'function'
      ? updater(current)
      : updater;

    if (!next || next === current) {
      return;
    }

    if (
      options.recordHistory !== false
      && !skipHistoryRef.current
    ) {
      const nextHistory = {
        past: [
          ...historyRef.current.past.slice(-39),
          cloneTemplate(current),
        ],
        future: [],
      };

      historyRef.current = nextHistory;
      setHistory(nextHistory);
    }

    templateRef.current = next;
    setTemplate(next);
  };

  const restoreTemplateSnapshot = (
    snapshot,
  ) => {
    const restored = cloneTemplate(snapshot);

    skipHistoryRef.current = true;
    templateRef.current = restored;
    setTemplate(restored);

    queueMicrotask(() => {
      skipHistoryRef.current = false;
    });
  };

  const undo = () => {
    const currentHistory = historyRef.current;

    if (!currentHistory.past.length) {
      return;
    }

    const previous =
      currentHistory.past.at(-1);

    const nextHistory = {
      past:
        currentHistory.past.slice(0, -1),
      future: [
        cloneTemplate(templateRef.current),
        ...currentHistory.future,
      ].slice(0, 40),
    };

    historyRef.current = nextHistory;
    setHistory(nextHistory);
    restoreTemplateSnapshot(previous);
  };

  const redo = () => {
    const currentHistory = historyRef.current;

    if (!currentHistory.future.length) {
      return;
    }

    const next = currentHistory.future[0];

    const nextHistory = {
      past: [
        ...currentHistory.past,
        cloneTemplate(templateRef.current),
      ].slice(-40),
      future:
        currentHistory.future.slice(1),
    };

    historyRef.current = nextHistory;
    setHistory(nextHistory);
    restoreTemplateSnapshot(next);
  };

  const autosaveTemplate = useCallback(async (currentTemplate) => {
    if (!currentTemplate || currentTemplate.isPublished) return;
    await saveTemplate({
      ...currentTemplate,
      status: 'draft',
      updatedAt: new Date().toISOString(),
    });
  }, []);

  const autosaveStatus = useEditorAutosave({
    value: template,
    enabled: Boolean(template && !template.isPublished),
    onSave: autosaveTemplate,
  });

  const selectedElements = (page?.elements || []).filter(
    (item) => selectedIds.includes(item.id),
  );


  const selectionBounds = useMemo(() => {
    if (!selectedElements.length) return null;

    const left = Math.min(...selectedElements.map((item) => Number(item.x || 0)));
    const top = Math.min(...selectedElements.map((item) => Number(item.y || 0)));
    const right = Math.max(...selectedElements.map(
      (item) => Number(item.x || 0) + Number(item.width || 0),
    ));
    const bottom = Math.max(...selectedElements.map(
      (item) => Number(item.y || 0) + Number(item.height || 0),
    ));

    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
      centerX: left + ((right - left) / 2),
      centerY: top + ((bottom - top) / 2),
    };
  }, [selectedElements]);

  const selectElement = (
    item,
    event = null,
  ) => {
    const elements = page?.elements || [];
    const targetIds = getGroupedElementIds(elements, item);
    const additive = Boolean(
      event?.shiftKey
      || event?.ctrlKey
      || event?.metaKey
    );

    if (additive) {
      setSelectedIds((current) => {
        const targetIsSelected = targetIds.every((id) => current.includes(id));

        return targetIsSelected
          ? current.filter((id) => !targetIds.includes(id))
          : [...new Set([...current, ...targetIds])];
      });

      setFieldId(item.id);
      return;
    }

    setSelectedIds(targetIds);
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

  const updatePages = (
    next,
    options = {},
  ) => {
    commitTemplateChange((current) => ({
      ...current,
      pages: next.map((item, index) => ({
        ...item,
        order: index,
      })),
      updatedAt: new Date().toISOString(),
    }), options);
  };

  const updatePage = (
    patch,
    options = {},
  ) => {
    if (!page) return;

    updatePages(
      pages.map((item) => (
        item.id === page.id
          ? { ...item, ...patch }
          : item
      )),
      options,
    );
  };

  const updateField = (
    patch,
    options = {},
  ) => {
    if (!page || !field) return;

    updatePage(
      {
        elements: page.elements.map((item) => (
          item.id === field.id
            ? { ...item, ...patch }
            : item
        )),
      },
      options,
    );
  };

  const updateWholeTextStyle = (patch) => {
    if (
      !field
      || !['text', 'dynamicField'].includes(
        field.type,
      )
    ) {
      return;
    }

    updateField(patch);
  };

  const updateElementById = (
    targetPageId,
    targetElementId,
    patch,
    options = {},
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
    }), options);
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

  const applyInlineStyle = (stylePatch) => {
    if (!editingTextId) return;

    const range = savedSelectionRef.current;
    const editable = document.querySelector(
      `[data-rich-text-id="${editingTextId}"]`,
    );

    if (!range || !editable) return;

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    if (range.collapsed) {
      return;
    }

    const wrapper = document.createElement('span');

    Object.entries(stylePatch).forEach(
      ([property, value]) => {
        wrapper.style[property] = value;
      },
    );

    try {
      range.surroundContents(wrapper);
    } catch {
      const fragment = range.extractContents();
      wrapper.appendChild(fragment);
      range.insertNode(wrapper);
    }

    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);

    selection.removeAllRanges();
    selection.addRange(nextRange);

    savedSelectionRef.current =
      nextRange.cloneRange();
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
  };

  const applyInlineFontSize = (size) => {
    if (!editingTextId) return;

    applyInlineStyle({
      fontSize: `${Number(size)}px`,
    });
  };

  const applyInlineFontFamily = (
    fontFamily,
  ) => {
    if (!editingTextId) return;

    applyInlineStyle({
      fontFamily,
    });
  };

  const applyTextListCommand = (ordered = false) => {
    applyInlineCommand(
      ordered ? 'insertOrderedList' : 'insertUnorderedList',
    );
  };

  const applyTextIndentCommand = (direction) => {
    applyInlineCommand(direction === 'out' ? 'outdent' : 'indent');
  };

  const handleRichTextKeyDown = (event) => {
    if (event.key !== 'Tab') return;

    event.preventDefault();
    applyTextIndentCommand(event.shiftKey ? 'out' : 'in');
  };

  const finishTextEditing = () => {
    if (!editingTextId || !page) return;

    const editable = document.querySelector(
      `[data-rich-text-id="${editingTextId}"]`,
    );

    const textInteraction = (
      interactionRef.current?.mode === 'text-edit'
        ? interactionRef.current
        : null
    );

    if (editable) {
      updateElementById(
        page.id,
        editingTextId,
        {
          htmlContent: editable.innerHTML,
          content: editable.innerText,
        },
        {
          recordHistory: false,
        },
      );
    }

    if (textInteraction?.historySnapshot) {
      const nextHistory = {
        past: [
          ...historyRef.current.past.slice(-39),
          textInteraction.historySnapshot,
        ],
        future: [],
      };

      historyRef.current = nextHistory;
      setHistory(nextHistory);
    }

    interactionRef.current = null;
    savedSelectionRef.current = null;
    setEditingTextId(null);
  };

  const groupSelectedElements = () => {
    if (!page || selectedIds.length < 2) return;

    const groupedIds = expandIdsWithGroups(
      page.elements || [],
      selectedIds,
    );
    const groupId = createId('group');

    updatePage({
      elements: (page.elements || []).map((item) => (
        groupedIds.includes(item.id)
          ? { ...item, groupId }
          : item
      )),
    });

    setSelectedIds(groupedIds);
    setFieldId(groupedIds.at(-1) || null);
  };

  const ungroupSelectedElements = () => {
    if (!page || !selectedIds.length) return;

    const selectedGroupIds = new Set(
      (page.elements || [])
        .filter((item) => selectedIds.includes(item.id) && item.groupId)
        .map((item) => item.groupId),
    );

    if (!selectedGroupIds.size) return;

    const affectedIds = (page.elements || [])
      .filter((item) => selectedGroupIds.has(item.groupId))
      .map((item) => item.id);

    updatePage({
      elements: (page.elements || []).map((item) => {
        if (!selectedGroupIds.has(item.groupId)) return item;

        const nextItem = { ...item };
        delete nextItem.groupId;
        return nextItem;
      }),
    });

    setSelectedIds(affectedIds);
    setFieldId(affectedIds.at(-1) || null);
  };

  const duplicateSelectedElements = () => {
    if (!page || !selectedIds.length) return;

    const { copies } = cloneSelectedElements({
      elements: page.elements || [],
      selectedIds,
      createElementId: createId,
    });

    updatePage({
      elements: [
        ...(page.elements || []),
        ...copies,
      ],
    });

    setSelectedIds(copies.map((item) => item.id));
    setFieldId(copies.at(-1)?.id || null);
  };

  const copySelectedElements = () => {
    if (!page || !selectedIds.length) return;

    clipboardRef.current = (page.elements || [])
      .filter((item) => selectedIds.includes(item.id))
      .map((item) => cloneTemplate(item));
  };

  const pasteCopiedElements = () => {
    if (!page || !clipboardRef.current.length) return;

    const sourceIds = clipboardRef.current.map((item) => item.id);
    const { copies } = cloneSelectedElements({
      elements: clipboardRef.current,
      selectedIds: sourceIds,
      createElementId: createId,
    });

    clipboardRef.current = copies.map((item) => cloneTemplate(item));

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

  const getLayerUnits = (elements = page?.elements || []) => {
    const sorted = [...elements].sort(
      (first, second) => Number(second.zIndex || 0) - Number(first.zIndex || 0),
    );
    const seenGroups = new Set();

    return sorted.reduce((units, item) => {
      if (!item.groupId) {
        units.push({
          key: `element:${item.id}`,
          type: 'element',
          ids: [item.id],
        });
        return units;
      }

      if (seenGroups.has(item.groupId)) return units;
      seenGroups.add(item.groupId);

      units.push({
        key: `group:${item.groupId}`,
        type: 'group',
        groupId: item.groupId,
        ids: sorted
          .filter((entry) => entry.groupId === item.groupId)
          .map((entry) => entry.id),
      });
      return units;
    }, []);
  };

  const applyLayerUnitOrder = (units) => {
    if (!page) return;

    const elementsById = new Map(
      (page.elements || []).map((item) => [item.id, item]),
    );
    const orderedIdsTopToBottom = units.flatMap((unit) => unit.ids);
    const zIndexById = new Map();

    [...orderedIdsTopToBottom]
      .reverse()
      .forEach((id, index) => {
        zIndexById.set(id, index + 1);
      });

    updatePage({
      elements: (page.elements || []).map((item) => ({
        ...elementsById.get(item.id),
        zIndex: zIndexById.get(item.id) ?? Number(item.zIndex || 0),
      })),
    });
  };

  const reorderLayerUnits = (draggedKey, targetKey) => {
    if (!page || !draggedKey || !targetKey || draggedKey === targetKey) return;

    const units = getLayerUnits();
    const fromIndex = units.findIndex((unit) => unit.key === draggedKey);
    const toIndex = units.findIndex((unit) => unit.key === targetKey);

    if (fromIndex < 0 || toIndex < 0) return;

    const next = [...units];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    applyLayerUnitOrder(next);
  };

  const changeLayerOrder = (action, ids = selectedIds) => {
    if (!page || !ids.length) return;

    const units = getLayerUnits();
    const selectedSet = new Set(expandIdsWithGroups(page.elements || [], ids));
    const selectedUnitKeys = new Set(
      units
        .filter((unit) => unit.ids.some((id) => selectedSet.has(id)))
        .map((unit) => unit.key),
    );

    if (!selectedUnitKeys.size) return;

    let next = [...units];

    if (action === 'front') {
      next = [
        ...next.filter((unit) => selectedUnitKeys.has(unit.key)),
        ...next.filter((unit) => !selectedUnitKeys.has(unit.key)),
      ];
    } else if (action === 'back') {
      next = [
        ...next.filter((unit) => !selectedUnitKeys.has(unit.key)),
        ...next.filter((unit) => selectedUnitKeys.has(unit.key)),
      ];
    } else if (action === 'forward') {
      for (let index = 1; index < next.length; index += 1) {
        if (
          selectedUnitKeys.has(next[index].key)
          && !selectedUnitKeys.has(next[index - 1].key)
        ) {
          [next[index - 1], next[index]] = [next[index], next[index - 1]];
        }
      }
    } else if (action === 'backward') {
      for (let index = next.length - 2; index >= 0; index -= 1) {
        if (
          selectedUnitKeys.has(next[index].key)
          && !selectedUnitKeys.has(next[index + 1].key)
        ) {
          [next[index], next[index + 1]] = [next[index + 1], next[index]];
        }
      }
    }

    applyLayerUnitOrder(next);
  };

  const changeSelectedLayer = (direction) => {
    changeLayerOrder(direction === 'front' ? 'front' : 'back');
  };

  const updateLayerItems = (ids, updater) => {
    if (!page || !ids?.length) return;
    const idSet = new Set(ids);

    updatePage({
      elements: (page.elements || []).map((item) => (
        idSet.has(item.id)
          ? updater(item)
          : item
      )),
    });
  };

  const toggleLayerVisibility = (ids) => {
    const targets = (page?.elements || []).filter((item) => ids.includes(item.id));
    if (!targets.length) return;
    const shouldShow = targets.every((item) => item.visible === false);

    updateLayerItems(ids, (item) => ({
      ...item,
      visible: shouldShow,
    }));

    if (!shouldShow) {
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      if (ids.includes(fieldId)) setFieldId(null);
    }
  };

  const toggleLayerLock = (ids) => {
    const targets = (page?.elements || []).filter((item) => ids.includes(item.id));
    if (!targets.length) return;
    const shouldLock = targets.some((item) => !item.locked);

    updateLayerItems(ids, (item) => ({
      ...item,
      locked: shouldLock,
    }));
  };

  const renameLayer = (ids, name, groupId = null) => {
    const cleanName = String(name || '').trim();
    if (!cleanName || !ids?.length) return;

    updateLayerItems(ids, (item) => (
      groupId
        ? {
            ...item,
            metadata: {
              ...(item.metadata || {}),
              groupName: cleanName,
            },
          }
        : {
            ...item,
            name: cleanName,
          }
    ));
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

  const getCanvasPoint = (event) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();

    return {
      x: (event.clientX - bounds.left) / canvasZoom,
      y: (event.clientY - bounds.top) / canvasZoom,
    };
  };

  const beginMarqueeSelection = (event) => {
    if (
      event.button !== 0
      || event.target !== event.currentTarget
      || editingTextId
    ) {
      return;
    }

    event.preventDefault();

    const point = getCanvasPoint(event);
    const additive = Boolean(
      event.shiftKey || event.ctrlKey || event.metaKey
    );
    const baseIds = additive ? selectedIds : [];

    event.currentTarget.setPointerCapture?.(event.pointerId);
    marqueeRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      baseIds,
    };

    if (!additive) {
      clearSelection();
    }

    setSelectionRect({
      left: point.x,
      top: point.y,
      width: 0,
      height: 0,
    });
  };

  const moveMarqueeSelection = (event) => {
    const marquee = marqueeRef.current;

    if (!marquee || marquee.pointerId !== event.pointerId) return;

    event.preventDefault();
    const point = getCanvasPoint(event);
    const rect = normalizeRect(
      marquee.startX,
      marquee.startY,
      point.x,
      point.y,
    );
    const hitIds = (page?.elements || [])
      .filter((item) => item.visible !== false && elementIntersectsRect(item, rect))
      .map((item) => item.id);
    const nextIds = expandIdsWithGroups(
      page?.elements || [],
      [...new Set([...marquee.baseIds, ...hitIds])],
    );

    setSelectionRect({
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
    });
    setSelectedIds(nextIds);
    setFieldId(nextIds.at(-1) || null);
  };

  const endMarqueeSelection = (event) => {
    const marquee = marqueeRef.current;

    if (!marquee || marquee.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    marqueeRef.current = null;
    setSelectionRect(null);
  };

  const beginSelectionTransform = (
    event,
    mode,
    handle = '',
  ) => {
    if (!page || !selectionBounds || !selectedIds.length) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const activeElements = (page.elements || []).filter(
      (item) => selectedIds.includes(item.id) && !item.locked,
    );

    if (!activeElements.length) return;

    interactionRef.current = {
      pointerId: event.pointerId,
      historySnapshot: cloneTemplate(templateRef.current),
      mode,
      handle,
      pageId: page.id,
      activeIds: activeElements.map((item) => item.id),
      startClientX: event.clientX,
      startClientY: event.clientY,
      selectionBounds: { ...selectionBounds },
      groupStart: activeElements.map((item) => ({
        id: item.id,
        x: Number(item.x || 0),
        y: Number(item.y || 0),
        width: Number(item.width || 0),
        height: Number(item.height || 0),
        rotation: Number(item.rotation || 0),
      })),
      startAngle: Math.atan2(
        (event.clientY / canvasZoom) - selectionBounds.centerY,
        (event.clientX / canvasZoom) - selectionBounds.centerX,
      ),
    };
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

    const sourceIds = (
      selectedIds.includes(item.id)
        ? expandIdsWithGroups(page.elements || [], selectedIds)
        : getGroupedElementIds(page.elements || [], item)
    );

    let activeIds = sourceIds;
    let activeElementId = item.id;
    let workingElements = page.elements || [];

    if (mode === 'move' && event.altKey) {
      const { copies, idMap } = cloneSelectedElements({
        elements: page.elements || [],
        selectedIds: sourceIds,
        createElementId: createId,
        offsetX: 0,
        offsetY: 0,
      });

      commitTemplateChange((current) => ({
        ...current,
        pages: (current.pages || []).map((pageItem) => (
          pageItem.id === page.id
            ? {
                ...pageItem,
                elements: [...(pageItem.elements || []), ...copies],
              }
            : pageItem
        )),
        updatedAt: new Date().toISOString(),
      }), { recordHistory: false });

      activeIds = copies.map((copy) => copy.id);
      activeElementId = idMap.get(item.id) || activeIds.at(-1);
      workingElements = [...(page.elements || []), ...copies];
      setSelectedIds(activeIds);
      setFieldId(activeElementId);
    } else {
      setFieldId(item.id);
    }

    event.currentTarget.setPointerCapture?.(
      event.pointerId,
    );

    const groupStart = workingElements
      .filter((elementItem) => (
        activeIds.includes(elementItem.id)
      ))
      .map((elementItem) => ({
        id: elementItem.id,
        x: Number(elementItem.x || 0),
        y: Number(elementItem.y || 0),
        width: Number(elementItem.width || 0),
        height: Number(elementItem.height || 0),
        rotation: Number(elementItem.rotation || 0),
      }));

    const interactionHistorySnapshot =
      cloneTemplate(templateRef.current);

    interactionRef.current = {
      pointerId: event.pointerId,
      historySnapshot: interactionHistorySnapshot,
      mode,
      handle,
      pageId: page.id,
      elementId: activeElementId,
      activeIds,
      groupStart,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: Number(item.x || 0),
      startY: Number(item.y || 0),
      startWidth: Number(item.width || 0),
      startHeight: Number(item.height || 0),
      preserveAspectRatio:
        Boolean(item.preserveAspectRatio),
      aspectRatio:
        Number(item.width || 1)
        / Math.max(1, Number(item.height || 1)),
      selectionBounds: {
        x: Number(item.x || 0),
        y: Number(item.y || 0),
        width: Number(item.width || 0),
        height: Number(item.height || 0),
        centerX: Number(item.x || 0) + (Number(item.width || 0) / 2),
        centerY: Number(item.y || 0) + (Number(item.height || 0) / 2),
      },
      startAngle: Math.atan2(
        (event.clientY / canvasZoom)
          - (Number(item.y || 0) + (Number(item.height || 0) / 2)),
        (event.clientX / canvasZoom)
          - (Number(item.x || 0) + (Number(item.width || 0) / 2)),
      ),
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

    if (interaction.mode === 'rotate') {
      const bounds = interaction.selectionBounds;
      const currentAngle = Math.atan2(
        (event.clientY / canvasZoom) - bounds.centerY,
        (event.clientX / canvasZoom) - bounds.centerX,
      );
      let angleDelta = (currentAngle - interaction.startAngle) * (180 / Math.PI);

      if (event.shiftKey) {
        angleDelta = Math.round(angleDelta / 15) * 15;
      }

      const radians = angleDelta * (Math.PI / 180);
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);

      commitTemplateChange((current) => ({
        ...current,
        pages: (current.pages || []).map((pageItem) => (
          pageItem.id === interaction.pageId
            ? {
                ...pageItem,
                elements: (pageItem.elements || []).map((elementItem) => {
                  const start = interaction.groupStart.find(
                    (entry) => entry.id === elementItem.id,
                  );
                  if (!start) return elementItem;

                  const elementCenterX = start.x + (start.width / 2);
                  const elementCenterY = start.y + (start.height / 2);
                  const relativeX = elementCenterX - bounds.centerX;
                  const relativeY = elementCenterY - bounds.centerY;
                  const rotatedCenterX = bounds.centerX + (relativeX * cosine) - (relativeY * sine);
                  const rotatedCenterY = bounds.centerY + (relativeX * sine) + (relativeY * cosine);

                  return {
                    ...elementItem,
                    x: Math.round(rotatedCenterX - (start.width / 2)),
                    y: Math.round(rotatedCenterY - (start.height / 2)),
                    rotation: Math.round((start.rotation + angleDelta) * 10) / 10,
                  };
                }),
              }
            : pageItem
        )),
        updatedAt: new Date().toISOString(),
      }), { recordHistory: false });
      return;
    }

    if (interaction.mode === 'resize-selection') {
      const bounds = interaction.selectionBounds;
      const minSize = 24;
      let nextX = bounds.x;
      let nextY = bounds.y;
      let nextWidth = bounds.width;
      let nextHeight = bounds.height;

      if (interaction.handle.includes('e')) nextWidth = Math.max(minSize, bounds.width + deltaX);
      if (interaction.handle.includes('s')) nextHeight = Math.max(minSize, bounds.height + deltaY);
      if (interaction.handle.includes('w')) {
        nextWidth = Math.max(minSize, bounds.width - deltaX);
        nextX = bounds.x + (bounds.width - nextWidth);
      }
      if (interaction.handle.includes('n')) {
        nextHeight = Math.max(minSize, bounds.height - deltaY);
        nextY = bounds.y + (bounds.height - nextHeight);
      }

      if (interaction.handle.length === 2 && (event.shiftKey || interaction.activeIds.length > 1)) {
        const scale = Math.max(nextWidth / bounds.width, nextHeight / bounds.height);
        const proportionalWidth = Math.max(minSize, bounds.width * scale);
        const proportionalHeight = Math.max(minSize, bounds.height * scale);
        if (interaction.handle.includes('w')) nextX = bounds.x + bounds.width - proportionalWidth;
        if (interaction.handle.includes('n')) nextY = bounds.y + bounds.height - proportionalHeight;
        nextWidth = proportionalWidth;
        nextHeight = proportionalHeight;
      }

      const scaleX = nextWidth / bounds.width;
      const scaleY = nextHeight / bounds.height;

      commitTemplateChange((current) => ({
        ...current,
        pages: (current.pages || []).map((pageItem) => (
          pageItem.id === interaction.pageId
            ? {
                ...pageItem,
                elements: (pageItem.elements || []).map((elementItem) => {
                  const start = interaction.groupStart.find((entry) => entry.id === elementItem.id);
                  return start
                    ? {
                        ...elementItem,
                        x: Math.round(nextX + ((start.x - bounds.x) * scaleX)),
                        y: Math.round(nextY + ((start.y - bounds.y) * scaleY)),
                        width: Math.max(8, Math.round(start.width * scaleX)),
                        height: Math.max(8, Math.round(start.height * scaleY)),
                      }
                    : elementItem;
                }),
              }
            : pageItem
        )),
        updatedAt: new Date().toISOString(),
      }), { recordHistory: false });
      return;
    }

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
        }), {
          recordHistory: false,
        });
      } else {
        updateElementById(
          interaction.pageId,
          interaction.elementId,
          {
            x: next.x,
            y: next.y,
          },
          {
            recordHistory: false,
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

    const isCornerHandle = (
      interaction.handle.length === 2
    );

    if (
      interaction.preserveAspectRatio
      && isCornerHandle
    ) {
      const ratio = interaction.aspectRatio || 1;
      const widthChange = Math.abs(
        nextWidth - interaction.startWidth,
      );
      const heightChange = Math.abs(
        nextHeight - interaction.startHeight,
      );

      if (widthChange >= heightChange) {
        const previousHeight = nextHeight;
        nextHeight = Math.max(
          minimumHeight,
          nextWidth / ratio,
        );

        if (interaction.handle.includes('n')) {
          nextY += previousHeight - nextHeight;
        }
      } else {
        const previousWidth = nextWidth;
        nextWidth = Math.max(
          minimumWidth,
          nextHeight * ratio,
        );

        if (interaction.handle.includes('w')) {
          nextX += previousWidth - nextWidth;
        }
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
      {
        recordHistory: false,
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

    const snapshot = interaction.historySnapshot;

    interactionRef.current = null;

    if (snapshot) {
      const nextHistory = {
        past: [
          ...historyRef.current.past.slice(-39),
          snapshot,
        ],
        future: [],
      };

      historyRef.current = nextHistory;
      setHistory(nextHistory);
    }

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

    return (
      <>
        {[
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
              beginElementInteraction(event, item, 'resize', handle);
            }}
            onPointerMove={moveElementInteraction}
            onPointerUp={endElementInteraction}
            onPointerCancel={endElementInteraction}
          />
        ))}
        <span
          className="contract-rotation-handle"
          title="Girar"
          onPointerDown={(event) => beginElementInteraction(event, item, 'rotate')}
          onPointerMove={moveElementInteraction}
          onPointerUp={endElementInteraction}
          onPointerCancel={endElementInteraction}
        />
      </>
    );
  };

  const applySelectionAlignment = (mode) => {
    if (!page || selectedIds.length < 2) return;
    updatePage({
      elements: alignElements(page.elements || [], selectedIds, mode),
    });
  };

  const applySelectionDistribution = (axis) => {
    if (!page || selectedIds.length < 3) return;
    updatePage({
      elements: distributeElements(page.elements || [], selectedIds, axis),
    });
  };

  const toggleViewOption = (key) => {
    setViewOptions((current) => ({ ...current, [key]: !current[key] }));
  };

  const fitPageToStage = () => {
    if (!stageRef.current || !page) return;
    const bounds = stageRef.current.getBoundingClientRect();
    const widthRatio = (bounds.width - 96) / Number(page.width || 595.28);
    const heightRatio = (bounds.height - 120) / Number(page.height || 841.89);
    setCanvasZoom(Math.max(0.35, Math.min(1.5, Number(Math.min(widthRatio, heightRatio).toFixed(2)))));
  };

  const addQrCode = async () => {
    const value = window.prompt('Informe o texto ou link do QR Code:');
    if (!value?.trim()) return;
    try {
      const src = await QRCode.toDataURL(value.trim(), {
        width: 512,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      addElement(newQrCode(src, value.trim()));
    } catch (error) {
      console.error('Não foi possível gerar o QR Code:', error);
      setMessage('Não foi possível gerar o QR Code.');
    }
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

    templateRef.current = saved;
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

  const applyProcessedImage = async (
    source,
    options = {},
  ) => {
    if (!field) return;

    try {
      const processed = await trimTransparentImage(
        source,
      );

      const currentWidth = Number(
        field.width || 245,
      );

      const ratio = (
        processed.width
        / Math.max(1, processed.height)
      );

      const nextHeight = Math.max(
        40,
        Math.round(currentWidth / ratio),
      );

      updateField({
        src: processed.src,
        naturalWidth: processed.width,
        naturalHeight: processed.height,
        width: currentWidth,
        height:
          options.keepBox
            ? Number(field.height || nextHeight)
            : nextHeight,
        objectFit: 'contain',
        objectPositionX: 50,
        objectPositionY: 50,
        imageScale: 1,
        preserveAspectRatio: true,
      });
    } catch (error) {
      console.error(
        'Não foi possível ajustar a imagem:',
        error,
      );

      updateField({
        src: source,
        objectFit: 'contain',
        objectPositionX: 50,
        objectPositionY: 50,
        imageScale: 1,
        preserveAspectRatio: true,
      });
    }
  };

  const uploadImage = (event) => {
    const file = event.target.files?.[0];

    if (!file || !field) return;

    const reader = new FileReader();

    reader.onload = () => {
      void applyProcessedImage(
        String(reader.result || ''),
      );
    };

    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const trimCurrentImage = () => {
    if (!field?.src) return;

    void applyProcessedImage(field.src);
  };

  const fitImageBoxToContent = () => {
    if (!field) return;

    const naturalWidth = Number(
      field.naturalWidth || 0,
    );
    const naturalHeight = Number(
      field.naturalHeight || 0,
    );

    if (!naturalWidth || !naturalHeight) {
      trimCurrentImage();
      return;
    }

    const currentWidth = Number(
      field.width || 245,
    );

    updateField({
      height: Math.max(
        40,
        Math.round(
          currentWidth
          / (naturalWidth / naturalHeight),
        ),
      ),
      objectFit: 'contain',
      objectPositionX: 50,
      objectPositionY: 50,
      imageScale: 1,
      preserveAspectRatio: true,
    });
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

    interactionRef.current = {
      mode: 'text-edit',
      historySnapshot:
        cloneTemplate(templateRef.current),
      elementId: item.id,
      pageId: page?.id || null,
    };

    savedSelectionRef.current = null;
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

      if (isTyping) return;

      if (
        (event.ctrlKey || event.metaKey)
        && event.key.toLowerCase() === 'c'
      ) {
        event.preventDefault();
        copySelectedElements();
        return;
      }

      if (
        (event.ctrlKey || event.metaKey)
        && event.key.toLowerCase() === 'v'
      ) {
        event.preventDefault();
        pasteCopiedElements();
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
        (event.ctrlKey || event.metaKey)
        && event.key.toLowerCase() === 'g'
      ) {
        event.preventDefault();

        if (event.shiftKey) {
          ungroupSelectedElements();
        } else {
          groupSelectedElements();
        }

        return;
      }

      if (
        (event.ctrlKey || event.metaKey)
        && (event.key === ']' || event.key === '[')
        && selectedIds.length
      ) {
        event.preventDefault();

        if (event.key === ']') {
          changeLayerOrder(event.altKey ? 'front' : 'forward');
        } else {
          changeLayerOrder(event.altKey ? 'back' : 'backward');
        }

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
        if (editingTextId) {
          finishTextEditing();
        }

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
      <EditorToolbar
        template={template}
        canUndo={Boolean(history.past.length)}
        canRedo={Boolean(history.future.length)}
        onBack={() => navigate('/configuracoes/modelos-contratos')}
        onNameChange={(name) => {
          commitTemplateChange((current) => ({
            ...current,
            name,
          }));
        }}
        onUndo={undo}
        onRedo={redo}
        onApplyBlueprint={applyCompleteModel}
        onSave={save}
        onPublish={publish}
      />

      <MobileTabs
        value={mobileTab}
        onChange={setMobileTab}
      />

      <div className="contract-editor-grid">
        <PagesPanel
          pages={pages}
          pageId={pageId}
          mobileActive={mobileTab === 'pages'}
          onAddPage={() => {
            const item = newPage(pages.length);
            updatePages([...pages, item]);
            setPageId(item.id);
            setFieldId(null);
            setSelectedIds([]);
          }}
          onSelectPage={(id) => {
            setPageId(id);
            setFieldId(null);
            setSelectedIds([]);
          }}
          onRenamePage={(id, name) => {
            updatePages(pages.map((item) => (
              item.id === id ? { ...item, name } : item
            )));
          }}
          onTogglePage={(id, active) => {
            updatePages(pages.map((item) => (
              item.id === id ? { ...item, active } : item
            )));
          }}
          onMovePage={(index, delta) => {
            const next = [...pages];
            const target = index + delta;
            [next[index], next[target]] = [next[target], next[index]];
            updatePages(next);
          }}
          onDuplicatePage={(item, index) => {
            const copy = {
              ...item,
              id: createId('page'),
              name: `${item.name} cópia`,
              elements: (item.elements || []).map((element) => ({
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
          onDeletePage={(id) => {
            const next = pages.filter((item) => item.id !== id);
            updatePages(next);
            if (id === pageId) {
              setPageId(next[0]?.id || null);
              setFieldId(null);
              setSelectedIds([]);
            }
          }}
        />

        <main
          ref={stageRef}
          className={`contract-a4-stage ${
            mobileTab === 'canvas'
              ? 'mobile-active'
              : ''
          }`}
        >
          <EditorWorkspaceToolbar
            zoom={canvasZoom}
            hasSelection={Boolean(selectedIds.length)}
            multipleSelection={selectedIds.length > 1}
            viewOptions={viewOptions}
            autosaveStatus={autosaveStatus}
            onZoomOut={() => setCanvasZoom((current) => Math.max(0.35, Number((current - 0.1).toFixed(2))))}
            onZoomIn={() => setCanvasZoom((current) => Math.min(2.5, Number((current + 0.1).toFixed(2))))}
            onResetZoom={() => setCanvasZoom(1)}
            onFitPage={fitPageToStage}
            onToggleView={toggleViewOption}
            onSelectAll={selectAllElements}
            onDelete={deleteSelectedElements}
            onAlign={applySelectionAlignment}
            onDistribute={applySelectionDistribution}
          />

          <div
            className={`contract-a4 ${viewOptions.grid ? 'show-grid' : ''}`}
            onPointerDown={beginMarqueeSelection}
            onPointerMove={moveMarqueeSelection}
            onPointerUp={endMarqueeSelection}
            onPointerCancel={endMarqueeSelection}
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
            {viewOptions.rulers && (
              <>
                <div className="contract-ruler-horizontal" aria-hidden="true" />
                <div className="contract-ruler-vertical" aria-hidden="true" />
              </>
            )}
            {viewOptions.margins && <div className="contract-safe-margin" aria-hidden="true" />}
            <SelectionBox rect={selectionRect} />

            {selectedIds.length > 1 && selectionBounds && (
              <div
                className="contract-multi-selection-frame"
                style={{
                  left: selectionBounds.x,
                  top: selectionBounds.y,
                  width: selectionBounds.width,
                  height: selectionBounds.height,
                }}
              >
                {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => (
                  <span
                    key={handle}
                    className={`contract-resize-handle handle-${handle}`}
                    onPointerDown={(event) => beginSelectionTransform(event, 'resize-selection', handle)}
                    onPointerMove={moveElementInteraction}
                    onPointerUp={endElementInteraction}
                    onPointerCancel={endElementInteraction}
                  />
                ))}
                <span
                  className="contract-rotation-handle"
                  title="Girar seleção"
                  onPointerDown={(event) => beginSelectionTransform(event, 'rotate')}
                  onPointerMove={moveElementInteraction}
                  onPointerUp={endElementInteraction}
                  onPointerCancel={endElementInteraction}
                />
              </div>
            )}

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
                  const control = event.target.closest(
                    'button, select, input',
                  );

                  if (control) {
                    rememberTextSelection();
                  }

                  if (event.target.closest('button')) {
                    event.preventDefault();
                  }
                }}
              >
                <select
                  defaultValue={field.fontFamily || 'Helvetica'}
                  onChange={(event) => {
                    applyInlineFontFamily(
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
                  onInput={(event) => {
                    applyInlineFontSize(
                      Number(event.currentTarget.value),
                    );
                  }}
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
                    restoreTextSelection();
                    document.execCommand(
                      'bold',
                      false,
                      null,
                    );
                    rememberTextSelection();
                  }}
                  title="Negrito"
                >
                  <Bold />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    restoreTextSelection();
                    document.execCommand(
                      'italic',
                      false,
                      null,
                    );
                    rememberTextSelection();
                  }}
                  title="Itálico"
                >
                  <Italic />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    restoreTextSelection();
                    document.execCommand(
                      'underline',
                      false,
                      null,
                    );
                    rememberTextSelection();
                  }}
                  title="Sublinhado"
                >
                  <Underline />
                </button>

                <button
                  type="button"
                  onClick={() => applyInlineCommand('strikeThrough')}
                  title="Tachado"
                >
                  <Strikethrough />
                </button>

                <span className="contract-inline-toolbar-divider" />

                <button
                  type="button"
                  onClick={() => applyTextListCommand(false)}
                  title="Lista com marcadores"
                >
                  <List />
                </button>

                <button
                  type="button"
                  onClick={() => applyTextListCommand(true)}
                  title="Lista numerada"
                >
                  <ListOrdered />
                </button>

                <button
                  type="button"
                  onClick={() => applyTextIndentCommand('out')}
                  title="Diminuir recuo"
                >
                  <IndentDecrease />
                </button>

                <button
                  type="button"
                  onClick={() => applyTextIndentCommand('in')}
                  title="Aumentar recuo"
                >
                  <IndentIncrease />
                </button>

                <input
                  type="color"
                  defaultValue={field.color || '#222222'}
                  onChange={(event) => {
                    applyInlineStyle({
                      color: event.target.value,
                    });
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
                    applyInlineCommand('justifyFull');
                  }}
                  title="Justificar"
                >
                  <AlignJustify />
                </button>

                <button
                  type="button"
                  onClick={finishTextEditing}
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

                if (['line', 'arrow', 'polygon', 'signature', 'qrcode'].includes(item.type)) {
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      className={`contract-canvas-element advanced-object ${item.type}-element ${selectedIds.includes(item.id) ? 'selected' : ''}`}
                      onClick={(event) => selectElement(item, event)}
                      onPointerDown={(event) => beginElementInteraction(event, item, 'move')}
                      onPointerMove={moveElementInteraction}
                      onPointerUp={endElementInteraction}
                      onPointerCancel={endElementInteraction}
                      style={commonStyle}
                    >
                      {item.type === 'qrcode' && <img src={item.src} alt={item.alt || 'QR Code'} draggable="false" />}
                      {item.type === 'polygon' && (
                        <span style={{ backgroundColor: item.backgroundColor, borderColor: item.borderColor, borderWidth: item.borderWidth }} />
                      )}
                      {(item.type === 'line' || item.type === 'arrow') && (
                        <span style={{ borderTopColor: item.strokeColor, borderTopWidth: item.strokeWidth, borderTopStyle: item.strokeStyle }}>
                          {item.type === 'arrow' && <i style={{ borderLeftColor: item.strokeColor }} />}
                        </span>
                      )}
                      {item.type === 'signature' && (
                        <span className="signature-placeholder" style={{ color: item.color, borderBottomColor: item.lineColor }}>{item.content || 'Assinatura'}</span>
                      )}
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
                      if (
                        editingTextId === item.id
                        || event.target.closest(
                          '.contract-rich-text-content[contenteditable="true"]',
                        )
                      ) {
                        return;
                      }

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
                      editingTextId === item.id ? (
                        <div
                          className="contract-rich-text-content"
                          data-rich-text-id={item.id}
                          contentEditable
                          suppressContentEditableWarning
                          ref={(node) => {
                            if (
                              node
                              && !node.dataset.initialized
                            ) {
                              node.innerHTML =
                                item.htmlContent
                                || String(item.content || '')
                                  .replace(/\n/g, '<br>');

                              node.dataset.initialized = 'true';
                            }
                          }}
                          onMouseUp={rememberTextSelection}
                          onKeyUp={rememberTextSelection}
                          onInput={rememberTextSelection}
                          onBlur={rememberTextSelection}
                        />
                      ) : (
                        <div
                          className="contract-rich-text-content"
                          data-rich-text-id={item.id}
                          dangerouslySetInnerHTML={{
                            __html:
                              item.htmlContent
                              || String(item.content || '')
                                .replace(/\n/g, '<br>'),
                          }}
                        />
                      )
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

              <button type="button" onClick={() => addElement(newLine(false))}>
                <Minus />
                Linha
              </button>

              <button type="button" onClick={() => addElement(newLine(true))}>
                <ArrowRight />
                Seta
              </button>

              <button type="button" onClick={() => addElement(newPolygon())}>
                <Plus />
                Polígono
              </button>

              <button type="button" onClick={addQrCode}>
                <Plus />
                QR Code
              </button>

              <button type="button" onClick={() => addElement(newSignature())}>
                <Plus />
                Assinatura
              </button>
            </div>
          </section>

          <LayersPanel
            elements={page?.elements || []}
            selectedIds={selectedIds}
            getLabel={getElementLabel}
            onSelect={selectElement}
            onToggleVisible={toggleLayerVisibility}
            onToggleLocked={toggleLayerLock}
            onRename={renameLayer}
            onReorder={reorderLayerUnits}
            onBringForward={() => changeLayerOrder('forward')}
            onSendBackward={() => changeLayerOrder('backward')}
            onBringToFront={() => changeLayerOrder('front')}
            onSendToBack={() => changeLayerOrder('back')}
          />

          {selectedIds.length > 1 && (
            <div className="contract-bulk-actions">
              <button
                type="button"
                onClick={groupSelectedElements}
                title="Agrupar (Ctrl+G)"
              >
                Agrupar
              </button>

              {selectedElements.some((item) => item.groupId) && (
                <button
                  type="button"
                  onClick={ungroupSelectedElements}
                  title="Desagrupar (Ctrl+Shift+G)"
                >
                  Desagrupar
                </button>
              )}
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
                      onBlur={(event) => {
                        const sourceValue =
                          event.target.value.trim();

                        if (sourceValue) {
                          void applyProcessedImage(
                            sourceValue,
                          );
                        }
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

                  <button
                    type="button"
                    onClick={trimCurrentImage}
                    disabled={!field.src}
                  >
                    Remover margens transparentes
                  </button>

                  <button
                    type="button"
                    onClick={fitImageBoxToContent}
                    disabled={!field.src}
                  >
                    Ajustar caixa à logomarca
                  </button>

                  <label className="contract-visible-toggle">
                    <input
                      type="checkbox"
                      checked={
                        field.preserveAspectRatio !== false
                      }
                      onChange={(event) => {
                        updateField({
                          preserveAspectRatio:
                            event.target.checked,
                        });
                      }}
                    />
                    Manter proporção ao redimensionar
                  </label>
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
                        updateWholeTextStyle({
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
                        updateWholeTextStyle({
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
                        updateWholeTextStyle({
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
                        updateWholeTextStyle({
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
                        updateWholeTextStyle({
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


                    <button
                      type="button"
                      className={
                        field.textDecoration === 'line-through'
                          ? 'active'
                          : ''
                      }
                      onClick={() => {
                        updateWholeTextStyle({
                          textDecoration:
                            field.textDecoration === 'line-through'
                              ? 'none'
                              : 'line-through',
                        });
                      }}
                      title="Tachado"
                    >
                      <Strikethrough />
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
                          updateWholeTextStyle({
                            align: value,
                          });
                        }}
                        title={label}
                      >
                        <Icon />
                      </button>
                    ))}
                  </div>

                  <div className="contract-text-list-tools">
                    <button
                      type="button"
                      onClick={() => {
                        if (editingTextId) applyTextListCommand(false);
                      }}
                      disabled={!editingTextId}
                      title="Lista com marcadores (edite o texto para aplicar)"
                    >
                      <List /> Marcadores
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (editingTextId) applyTextListCommand(true);
                      }}
                      disabled={!editingTextId}
                      title="Lista numerada (edite o texto para aplicar)"
                    >
                      <ListOrdered /> Numeração
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTextIndentCommand('out')}
                      disabled={!editingTextId}
                      title="Diminuir recuo"
                    >
                      <IndentDecrease />
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTextIndentCommand('in')}
                      disabled={!editingTextId}
                      title="Aumentar recuo"
                    >
                      <IndentIncrease />
                    </button>
                  </div>

                  <p className="contract-text-helper">
                    Dê dois cliques no texto para aplicar listas, recuos e estilos em trechos específicos. Use Tab e Shift+Tab para ajustar a tabulação.
                  </p>

                  <label>
                    Espaçamento entre linhas
                    <input
                      type="number"
                      min="0.8"
                      max="3"
                      step="0.05"
                      value={field.lineHeight || 1.4}
                      onChange={(event) => {
                        updateWholeTextStyle({
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
                        updateWholeTextStyle({
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
                        updateWholeTextStyle({
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