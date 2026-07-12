import DOCUMENT_INSTANCE_DEFAULT from './documentInstanceSchema';

export const PACKAGE_OPTION_DEFAULT = {
  id: null,
  name: '',
  description: '',
  services: [],
  duration: '',
  photographers: 1,
  video: false,
  preWedding: false,
  makingOf: false,
  album: false,
  photoQuantity: 0,
  deliveryTime: '',
  extras: [],
  travelFee: 0,
  originalPrice: 0,
  discount: 0,
  finalPrice: 0,
  deposit: 0,
  installments: 0,
  paymentConditions: '',
  isRecommended: false,
  order: 0,
};

export const PROPOSAL_INSTANCE_DEFAULT = {
  ...DOCUMENT_INSTANCE_DEFAULT,
  documentType: 'proposal',
  packages: [], // array of PACKAGE_OPTION_DEFAULT
  status: 'draft', // draft, generated, sent, approved, rejected, expired, replaced
};

export function createPackageOption(values = {}) {
  return { ...PACKAGE_OPTION_DEFAULT, ...values };
}

export default PROPOSAL_INSTANCE_DEFAULT;
