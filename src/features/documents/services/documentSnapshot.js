import { deepClone, normalizeDate } from '../utils/documentValidation';

const normalizeSnapshotDates = (snapshot = {}) => {
  if (snapshot.createdAt) snapshot.createdAt = normalizeDate(snapshot.createdAt);
  if (snapshot.updatedAt) snapshot.updatedAt = normalizeDate(snapshot.updatedAt);
  if (snapshot.publishedAt) snapshot.publishedAt = normalizeDate(snapshot.publishedAt);
  if (snapshot.generatedAt) snapshot.generatedAt = normalizeDate(snapshot.generatedAt);
  if (snapshot.sentAt) snapshot.sentAt = normalizeDate(snapshot.sentAt);
  if (snapshot.approvedAt) snapshot.approvedAt = normalizeDate(snapshot.approvedAt);
  return snapshot;
};

const createSnapshot = (value) => {
  if (!value || typeof value !== 'object') {
    return value;
  }

  const snapshot = deepClone(value);
  return normalizeSnapshotDates(snapshot);
};

export function createTemplateSnapshot(template) {
  return createSnapshot(template);
}

export function createPricingSnapshot(pricing) {
  return createSnapshot(pricing);
}

export function createClientSnapshot(client) {
  return createSnapshot(client);
}

export function createWorkSnapshot(work) {
  return createSnapshot(work);
}

export function createStudioSnapshot(studio) {
  return createSnapshot(studio);
}

export function createDocumentSnapshotBundle({ template, pricing, client, work, studio, document }) {
  return {
    createdAt: new Date().toISOString(),
    template: createTemplateSnapshot(template),
    pricing: createPricingSnapshot(pricing),
    client: createClientSnapshot(client),
    work: createWorkSnapshot(work),
    studio: createStudioSnapshot(studio),
    document: createSnapshot(document),
  };
}

export default {
  createTemplateSnapshot,
  createPricingSnapshot,
  createClientSnapshot,
  createWorkSnapshot,
  createStudioSnapshot,
  createDocumentSnapshotBundle,
};
