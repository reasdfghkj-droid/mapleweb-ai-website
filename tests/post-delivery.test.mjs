import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { evaluatePostDeliveryInvoice } from '../billing/post-delivery-gate.mjs';

const project = {
  paymentModel: 'post_delivery',
  status: 'DELIVERED',
  currentVersion: 2,
  quoteApprovedVersion: 2,
  customerApprovedVersion: 2,
  ownerApprovedVersion: 2,
  approvedFinalTotalCadCents: 135000,
  ownerApprovedInvoiceTotalCadCents: 135000,
  quoteAcceptedAt: '2026-01-01T00:00:00.000Z',
  deliveredAt: '2026-01-05T00:00:00.000Z',
  deliveryConfirmedAt: '2026-01-06T00:00:00.000Z',
  customerEmail: 'test@example.com',
  invoiceDueTermsAccepted: true,
  ownerApprovedInvoice: true,
  previewVerified: true,
  securityCheckPassed: true,
  outstandingRevisions: false,
  existingInvoiceId: null
};

const valid = evaluatePostDeliveryInvoice(project);
assert.equal(valid.eligibleForOwnerDraftInvoice, true);
assert.equal(valid.action, 'OWNER_REVIEW_DRAFT_ONLY');
assert.equal(valid.canSendInvoiceAutomatically, false);
assert.equal(valid.customerCharged, false);
assert.equal(valid.stripeOperationPerformed, false);

const blockedCases = [
  ['work not delivered', { status: 'IN_PROGRESS' }],
  ['only previewed, not delivered', { status: 'PREVIEW_READY', deliveredAt: null }],
  ['missing delivery timestamp', { deliveredAt: null }],
  ['customer did not confirm receipt', { deliveryConfirmedAt: null }],
  ['receipt before delivery', { deliveryConfirmedAt: '2026-01-04T00:00:00.000Z' }],
  ['delivery before agreement', { deliveredAt: '2025-12-31T00:00:00.000Z' }],
  ['no accepted quote', { quoteAcceptedAt: null }],
  ['version changed after quote', { currentVersion: 3 }],
  ['customer did not approve current version', { customerApprovedVersion: null }],
  ['owner did not approve current version', { ownerApprovedVersion: null }],
  ['owner has not approved invoice', { ownerApprovedInvoice: false }],
  ['missing agreed payment due terms', { invoiceDueTermsAccepted: false }],
  ['increased invoice amount', { ownerApprovedInvoiceTotalCadCents: 150000 }],
  ['invalid amount', { approvedFinalTotalCadCents: -1 }],
  ['rounding, fractional cents', { approvedFinalTotalCadCents: 135000.5 }],
  ['no confirmed billing email', { customerEmail: '' }],
  ['prior invoice exists', { existingInvoiceId: 'in_test_123' }],
  ['already created invoice', { invoiceStatus: 'draft' }],
  ['security test missing', { securityCheckPassed: false }],
  ['unresolved changes', { outstandingRevisions: true }],
  ['upfront payment model', { paymentModel: 'deposit' }],
];
for (const [name, change] of blockedCases) {
  const result = evaluatePostDeliveryInvoice({ ...project, ...change });
  assert.equal(result.eligibleForOwnerDraftInvoice, false, name);
  assert.ok(result.blockers.length, name);
  assert.equal(result.canSendInvoiceAutomatically, false, name);
}
assert.equal(evaluatePostDeliveryInvoice(null).eligibleForOwnerDraftInvoice, false);
assert.equal(evaluatePostDeliveryInvoice({}).eligibleForOwnerDraftInvoice, false);

const home=fs.readFileSync('public/index.html','utf8');
const rootHome=fs.readFileSync('index.html','utf8');
const sales=fs.readFileSync('public/sales.html','utf8');
const rootSales=fs.readFileSync('sales.html','utf8');
const chat=fs.readFileSync('public/chat-experience.js','utf8');
const rootChat=fs.readFileSync('chat-experience.js','utf8');
const planner=fs.readFileSync('public/build-with-ai.html','utf8');
for(const [name,c] of [['home',home],['root home',rootHome],['sales',sales],['root sales',rootSales],['planner',planner]]) {
  assert.ok(/no upfront deposit|no deposit required|No upfront deposit|No deposit/i.test(c),name+' lacks no-deposit terms');
}
assert.ok(home.includes('5. Receive your finished website'));
assert.ok(home.includes('6. Pay after delivery'));
assert.ok(!home.includes('5. Pay as agreed'));
assert.ok(home.includes('When do I pay for my website?'));
assert.ok(sales.includes('The agreed invoice is requested after the approved finished website is delivered'));
for(const [name,c] of [['chat',chat],['root chat',rootChat]]) {
  assert.ok(c.includes('Our policy is pay after delivery — no deposit'),name);
  new vm.Script(c,{filename:name+'.js'});
}
const inlineSales=sales.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inlineSales);
new vm.Script(inlineSales,{filename:'sales-inline.js'});
console.log('PASS post-delivery invoicing gate: 21 blocked/positive scenarios; no automatic invoice/charge; customer-facing no-deposit terms; scripts parse');
