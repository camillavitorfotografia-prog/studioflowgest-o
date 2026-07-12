import { createId as createStorageId } from '../../../utils/storage';

export function createId(prefix = 'doc') {
  return createStorageId(prefix);
}

export default { createId };

export function stableId(prefix = 'doc') {
  // stable wrapper - currently same as createId but abstracted for future changes
  return createStorageId(prefix);
}
