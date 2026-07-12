# Documents Architecture (StudioFlow)

This document describes the document/template architecture introduced in Etapa 1.

## Concepts

- Template (DocumentTemplate): global model defining pages and elements. Versioned and publishable.
- Instance (DocumentInstance): generated document (proposal/contract) that stores immutable snapshots.
- ProposalTemplate / ProposalInstance: specific templates and instances for proposals.
- ContractTemplate / ContractInstance: specific templates and instances for contracts.

## Template vs Instance

- Template: editable, versioned; contains pages with backgrounds and elements (text/image/dynamicField).
- Instance: immutable snapshot at generation time; contains references to templateId and templateVersion and snapshots of pricing/client/work/studio.

## Versioning

- Published versions are immutable. Editing a published template creates a draft/new version.
- Instances reference templateVersion used.

## Persistence

- `documentStorageAdapter` provides a single API for templates and documents, using Supabase when configured and localStorage as fallback.

## Placeholders and dynamic fields

- Templates may include `dynamicField` elements (e.g. `client.name`, `pricing.total`). These are structured but not rendered in this stage.

## Future PDF strategy

- Proposals: build PDFs from template pages (JPEG + text blocks) via `proposalPdfGenerator`.
- Contracts: overlays positioned on the original contract PDF pages via `ContractOverlayEngine`.

## Relation with Precificação and CRM

- Precificação provides `pricingSnapshot` used to create ProposalInstances.
- CRM provides lead/client context for instances and will trigger contract generation after approval.
