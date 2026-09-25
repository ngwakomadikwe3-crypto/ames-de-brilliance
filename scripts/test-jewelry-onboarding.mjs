import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowedJewelryFile, handoffSourceDescriptor, isJewelryOwner, newJewelryProduct, operatorSourceEntry, previewablePackPath,
  technicalEvidenceValid, transitionJewelry,
} from '../src/lib/jewelry-workflow.ts';

const sourceHash = 'a'.repeat(64);
const base = {
  id: 'product-1', trader_id: 'approved-trader-1', name: 'Pendant', category: 'pendant',
  source_files: [{ fileId: 'private-file-1', filename: 'piece.obj', sha256: sourceHash, bytes: 100, kind: 'source' }],
  source_hashes: [sourceHash], workflow_status: 'submitted', asset_id: 'ames-pendant-1',
  revision_id: '', pack_hash: '', content_hash: '', technical_pass: false,
  visual_approval: 'pending', publication_status: 'review', review_reason: '',
  status_history: [], verified_metadata: {}, created_at: '', updated_at: '',
};
const pendingPack = {
  assetId: 'ames-pendant-1', revisionId: 'ames-pendant-1:1', name: 'Pendant', category: 'pendant',
  sourceSha256: sourceHash, packHash: 'b'.repeat(64), contentHash: 'c'.repeat(64),
  technicalPass: true, visualApproval: 'pending', publicationStatus: 'review',
  limitations: ['Physical scale unresolved'], files: [], quality: { commercialVisualApproval: 'pending' },
  geometry: {}, materials: {}, chat: { stageAsset: '', poster: '', defaultView: 'front', rotationEnabled: true, supportedViewerActions: [] },
  boutique: { name: 'Pendant', category: 'pendant', thumbnail: '', heroImage: '', interactiveGlb: '', poster: '', essentialSpecs: {} },
  mediaItems: [],
};

test('source types and private review paths reject unsupported inputs', () => {
  assert.equal(allowedJewelryFile('piece.obj', 100), 'source');
  assert.equal(allowedJewelryFile('piece.GLB', 100), 'source');
  assert.equal(allowedJewelryFile('piece.fbx', 100), 'source');
  assert.equal(allowedJewelryFile('piece.zip', 100), 'source');
  assert.equal(allowedJewelryFile('front.png', 100), 'photo');
  assert.equal(allowedJewelryFile('certificate.pdf', 100), 'document');
  assert.equal(allowedJewelryFile('payload.exe', 100), null);
  assert.equal(allowedJewelryFile('piece.obj', 0), null);
  assert.equal(allowedJewelryFile('piece.obj', 251 * 1024 * 1024), null);
  assert.equal(previewablePackPath('web/jewelry.glb'), true);
  assert.equal(previewablePackPath('master/geometry-validation.json'), true);
  assert.equal(previewablePackPath('source-assets/secret.obj'), false);
  assert.equal(previewablePackPath('web/../source-assets/secret.obj'), false);
});

test('operator handoff records a real source identity without a fake file reference', () => {
  const source = operatorSourceEntry({ filename: 'piece.glb', bytes: 100, sha256: 'A'.repeat(64) });
  assert.equal(source.sourceMode, 'operator_handoff');
  assert.equal(source.fileId, undefined);
  assert.equal(source.sha256, 'a'.repeat(64));
  assert.throws(() => operatorSourceEntry({ filename: 'piece.glb', bytes: 100, sha256: 'bad' }), /SHA-256/);
  assert.throws(() => operatorSourceEntry({ filename: 'piece.exe', bytes: 100, sha256: 'a'.repeat(64) }), /OBJ, GLB, FBX, or ZIP/);
  assert.equal('download' in handoffSourceDescriptor('p-1', source, 'operator_handoff'), false);
  assert.equal(handoffSourceDescriptor('p-1', { ...source, fileId: 'cloud-file', sourceMode: 'cloud_source_upload' }, 'cloud_source_upload').download,
    '/api/jewelry-products/p-1/source/cloud-file');
});

test('only the existing owner role can manage jewelry review', () => {
  assert.equal(isJewelryOwner('owner'), true);
  assert.equal(isJewelryOwner('cousin'), false);
  assert.equal(isJewelryOwner(null), false);
});

test('an approved trader creates one jewelry identity without invented commercial claims', () => {
  const product = newJewelryProduct({ id: '1234', traderId: 'trader-1', traderStatus: 'Active',
    name: ' Pendant ', category: 'Pendant', now: '2026-09-23T00:00:00.000Z' });
  assert.equal(product.trader_id, 'trader-1');
  assert.equal(product.asset_id, 'ames-1234');
  assert.equal(product.category, 'pendant');
  assert.equal(product.workflow_status, 'submitted');
  assert.equal(product.publication_status, 'review');
  assert.equal(product.source_mode, 'cloud_source_upload');
  assert.deepEqual(product.verified_metadata, {});
  assert.equal('carat' in product, false);
  assert.equal('price' in product, false);
  assert.throws(() => newJewelryProduct({ id: '1234', traderId: 'trader-2', traderStatus: 'Pending',
    name: 'Pendant', category: 'pendant', now: '' }), /approved trader/);
});

test('submitted product reaches technical and visual review with exact source and pack identity', () => {
  let product = { ...base };
  assert.equal(transitionJewelry(product, 'start_processing').workflow_status, 'processing');
  product = { ...product, ...transitionJewelry(product, 'start_processing') };
  assert.equal(technicalEvidenceValid(pendingPack, product), true);
  product = { ...product, ...transitionJewelry(product, 'attach_pack', pendingPack) };
  assert.equal(product.workflow_status, 'technical_review');
  assert.equal(product.revision_id, pendingPack.revisionId);
  assert.equal(product.pack_hash, pendingPack.packHash);
  product = { ...product, ...transitionJewelry(product, 'technical_pass', pendingPack) };
  assert.equal(product.workflow_status, 'visual_review');
  assert.equal(product.technical_pass, true);
  product = { ...product, ...transitionJewelry(product, 'approve', pendingPack) };
  assert.equal(product.visual_approval, 'approved');
  assert.throws(() => transitionJewelry(product, 'publish', pendingPack), /not visually approved/);
  const publishedPack = { ...pendingPack, packHash: 'd'.repeat(64),
    visualApproval: 'approved', publicationStatus: 'published',
    quality: { commercialVisualApproval: 'approved' } };
  assert.equal(transitionJewelry(product, 'publish', publishedPack).publication_status, 'published');
  assert.equal(transitionJewelry(product, 'publish', publishedPack).pack_hash, publishedPack.packHash);
  assert.throws(() => transitionJewelry(product, 'publish', { ...publishedPack, contentHash: 'e'.repeat(64) }), /content changed/);
});

test('false source identity, unsupported transitions, rejection and revision are controlled', () => {
  assert.throws(() => transitionJewelry({ ...base, source_files: [], source_hashes: [] }, 'start_processing'), /valid SHA-256/);
  assert.throws(() => transitionJewelry(base, 'attach_pack', { ...pendingPack, sourceSha256: 'z'.repeat(64) }), /source hash/);
  assert.throws(() => transitionJewelry(base, 'approve', pendingPack), /Cannot approve/);
  let product = { ...base, workflow_status: 'technical_review', revision_id: pendingPack.revisionId,
    pack_hash: pendingPack.packHash, content_hash: pendingPack.contentHash };
  assert.throws(() => transitionJewelry(product, 'reject', pendingPack), /reason is required/);
  product = { ...product, ...transitionJewelry(product, 'reject', pendingPack, 'Geometry issue') };
  assert.equal(product.workflow_status, 'rejected');
  const revision = transitionJewelry(product, 'request_revision', undefined, 'Repair requested');
  assert.equal(revision.workflow_status, 'revision_requested');
  assert.equal(revision.pack_hash, '');
  assert.equal(revision.visual_approval, 'pending');
});
