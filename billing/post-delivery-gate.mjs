/**
 * MapleWeb AI: payment-after-delivery gate for a future owner-only Stripe invoicing integration.
 *
 * PURE POLICY CHECK. This module makes no API calls, creates no invoice, sends no email,
 * changes no payment status, and must never be exposed as a public authorization endpoint.
 *
 * The trusted back-end (not the customer/browser) must validate project evidence,
 * save approval records, enforce authorization and idempotency before using this result.
 */
const MAX_APPROVED_CAD_CENTS = 10_000_000; // Safeguard only; not a quote or published price.
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validUtc(value) {
  return typeof value === 'string' && ISO_UTC.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === new Date(Date.parse(value)).toISOString() &&
    Date.parse(value) <= Date.now();
}

/**
 * Expected trusted project record:
 * {
 *  paymentModel:'post_delivery', status:'DELIVERED', currentVersion:3,
 *  quoteApprovedVersion:3, customerApprovedVersion:3, ownerApprovedVersion:3,
 *  approvedFinalTotalCadCents:100000, ownerApprovedInvoiceTotalCadCents:100000,
 *  quoteAcceptedAt:'2026-11-19T18:00:00.000Z', deliveredAt:'...', deliveryConfirmedAt:'...',
 *  customerEmail:'customer@example.com', invoiceDueTermsAccepted:true,
 *  ownerApprovedInvoice:true, previewVerified:true, securityCheckPassed:true,
 *  outstandingRevisions:false, existingInvoiceId:null
 * }
 */
export function evaluatePostDeliveryInvoice(project) {
  const p = project && typeof project === 'object' && !Array.isArray(project) ? project : {};
  const blockers = [];
  const version = p.currentVersion;
  const versionOk = Number.isSafeInteger(version) && version > 0;

  if (p.paymentModel !== 'post_delivery') blockers.push('Payment model is not pay after delivery');
  if (p.status !== 'DELIVERED') blockers.push('Completed website has not been delivered');
  if (!versionOk) blockers.push('Valid delivered version is missing');
  if (!versionOk || p.quoteApprovedVersion !== version) blockers.push('Signed quote does not match final version');
  if (!versionOk || p.customerApprovedVersion !== version) blockers.push('Customer has not approved delivered version');
  if (!versionOk || p.ownerApprovedVersion !== version) blockers.push('Owner has not approved delivered version');
  if (p.previewVerified !== true || p.securityCheckPassed !== true) blockers.push('Preview or security review incomplete');
  if (p.outstandingRevisions !== false) blockers.push('Unresolved customer revision requests');
  if (!validUtc(p.quoteAcceptedAt)) blockers.push('Accepted written quote has not been recorded');
  if (!validUtc(p.deliveredAt)) blockers.push('Delivery date/evidence is missing');
  if (!validUtc(p.deliveryConfirmedAt)) blockers.push('Customer receipt/hand-over has not been confirmed');
  if (validUtc(p.quoteAcceptedAt) && validUtc(p.deliveredAt) && Date.parse(p.deliveredAt) < Date.parse(p.quoteAcceptedAt))
    blockers.push('Delivery date precedes written quote acceptance');
  if (validUtc(p.deliveredAt) && validUtc(p.deliveryConfirmedAt) && Date.parse(p.deliveryConfirmedAt) < Date.parse(p.deliveredAt))
    blockers.push('Receipt confirmation precedes delivery');
  if (typeof p.customerEmail !== 'string' || p.customerEmail.length > 200 || !EMAIL.test(p.customerEmail))
    blockers.push('Verified billing email is missing');
  if (!Number.isSafeInteger(p.approvedFinalTotalCadCents) || p.approvedFinalTotalCadCents < 1 || p.approvedFinalTotalCadCents > MAX_APPROVED_CAD_CENTS)
    blockers.push('Approved CAD amount is invalid');
  if (p.ownerApprovedInvoiceTotalCadCents !== p.approvedFinalTotalCadCents)
    blockers.push('Invoice total differs from owner-approved final price');
  if (p.invoiceDueTermsAccepted !== true) blockers.push('Agreed invoice due date and terms are missing');
  if (p.ownerApprovedInvoice !== true) blockers.push('Owner has not approved invoicing after delivery');
  if (p.existingInvoiceId || p.invoiceStatus) blockers.push('A billing record already exists; prevent duplicate invoice');

  return Object.freeze({
    eligibleForOwnerDraftInvoice: blockers.length === 0,
    blockers,
    action: 'OWNER_REVIEW_DRAFT_ONLY',
    canSendInvoiceAutomatically: false,
    customerCharged: false,
    stripeOperationPerformed: false
  });
}
