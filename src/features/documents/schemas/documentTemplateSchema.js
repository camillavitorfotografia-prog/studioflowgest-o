export const DOCUMENT_TEMPLATE_DEFAULT = {
  id: null,
  documentType: 'proposal', // 'proposal' | 'contract'
  name: '',
  slug: '',
  category: '',
  version: 1,
  status: 'draft',
  isPublished: false,
  isLatest: true,
  createdBy: null,
  createdAt: null,
  updatedAt: null,
  publishedAt: null,
  previewImage: null,
  metadata: {},
  pages: [],
};

// Page shape example documented as helper
export const createPage = ({ id, name, order = 0, width = 595.28, height = 841.89 } = {}) => ({
  id: id || null,
  name: name || '',
  order,
  active: true,
  pageType: 'default',
  width,
  height,
  background: {
    type: 'none', // 'none' | 'jpeg' | 'pdf'
    url: null,
    opacity: 1,
    overlayColor: null,
    overlayOpacity: 0,
    positionX: 50,
    positionY: 50,
    zoom: 1,
  },
  elements: [],
  metadata: {},
});

export const ELEMENT_TYPES = ['text', 'image', 'logo', 'overlay', 'pricing', 'package', 'signature', 'dynamicField'];

export const createElement = ({ id = null, type = 'text', x = 0, y = 0, width = 100, height = 20 } = {}) => ({
  id,
  type: ELEMENT_TYPES.includes(type) ? type : 'text',
  x,
  y,
  width,
  height,
  rotation: 0,
  opacity: 1,
  zIndex: 1,
  locked: false,
  visible: true,
  metadata: {},
});

export const createTextElement = ({ id = null, content = '', placeholderKey = null, fontFamily = 'Helvetica', fontSize = 12, fontWeight = '400', fontStyle = 'normal', color = '#000000', align = 'left', lineHeight = 1.2, letterSpacing = 0, textTransform = 'none', hideIfEmpty = true, ...rest } = {}) => ({
  ...createElement({ id, type: 'text', ...rest }),
  content,
  placeholderKey,
  fontFamily,
  fontSize,
  fontWeight,
  fontStyle,
  color,
  align,
  lineHeight,
  letterSpacing,
  textTransform,
  hideIfEmpty: Boolean(hideIfEmpty),
});

// Create an empty template with one default page
export function createEmptyTemplate({ documentType = 'proposal', name = 'Novo Modelo', category = '' } = {}) {
  return {
    ...DOCUMENT_TEMPLATE_DEFAULT,
    id: null,
    documentType,
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    category,
    version: 1,
    status: 'draft',
    isPublished: false,
    isLatest: true,
    createdBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pages: [createPage({ id: null, name: 'Página 1', order: 0 })],
  };
}

export default DOCUMENT_TEMPLATE_DEFAULT;
