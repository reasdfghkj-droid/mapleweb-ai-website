/**
 * MapleWeb AI quote preparation — PRIVATE OWNER REVIEW ONLY.
 *
 * A sales estimate is NOT a signed customer agreement. This module prepares
 * a plain-text scope and price pack for review; no invoices, customer emails,
 * money transfers, paid services or website publication happen here.
 */
import {recommendPrice} from '../workers/mapleweb-agents.mjs';

const fields=['business','goal','pages','features','style','timeline','additional_details'];
const clean=s=>typeof s==='string'?s.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,850):'';
const dollars=cents=>Number.isSafeInteger(cents)?'$'+(cents/100).toLocaleString('en-CA',{
  minimumFractionDigits:2,maximumFractionDigits:2
}):'Not yet agreed';
const cad=n=>'$'+n.toLocaleString('en-CA');
const validDue=n=>Number.isSafeInteger(n)&&n>=1&&n<=60;
const validCents=n=>Number.isSafeInteger(n)&&n>=50000&&n<=10000000;

export function prepareOwnerQuotePack(input={},context={}) {
  const a=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  const options=context&&typeof context==='object'&&!Array.isArray(context)?context:{};
  const answers=Object.fromEntries(fields.map(key=>[key,clean(a[key])]));
  if(!answers.business||!answers.goal||!answers.pages||!answers.features||
     !answers.style||!answers.timeline)
    return {ok:false,error:'All six website requirements are needed before a quote can be prepared'};
  const recommended=recommendPrice(answers);
  const amount=options.approvedFinalTotalCadCents;
  if(amount!==null&&amount!==undefined&&!validCents(amount))
    return {ok:false,error:'Owner-approved total must be a valid integer CAD cents amount'};
  const due=options.invoiceDueDays;
  if(due!==null&&due!==undefined&&!validDue(due))
    return {ok:false,error:'Invoice due date terms must be 1–60 days'};
  const hasFinal=validCents(amount);
  const outside=hasFinal&&(amount<recommended.min*100||amount>recommended.max*100);
  const total=hasFinal?dollars(amount):'Not agreed — see published estimate below';
  const dueText=validDue(due)?String(due)+' days after invoice issue (subject to written acceptance)':
    'To be agreed in writing before work starts';
  const estimate=cad(recommended.min)+'–'+cad(recommended.max)+' CAD';
  const scope=[
    ['Customer business',answers.business],
    ['Website goal',answers.goal],
    ['Requested pages',answers.pages],
    ['Requested features',answers.features],
    ['Design preference',answers.style],
    ['Requested timing',answers.timeline],
    ['Additional instructions',answers.additional_details||'None provided']
  ];
  const terms=[
    'No deposit and no upfront payment of any kind.',
    'The customer receives the completed, approved website before being asked to pay.',
    'The owner and customer must agree to an exact final price and scope in writing before development starts.',
    'Customer and owner approvals, resolved revisions and confirmed handover are required before an invoice can be sent.',
    'Taxes, third-party subscriptions, domain, hosting, paid integrations and renewal fees must be identified and approved separately before the agreement is signed.',
    'Any delivery target, number of revisions, support period, intellectual-property terms, cancellations and refunds need an explicit written agreement.',
    'The final payment invoice is issued only after confirmed website delivery, using the agreed due date; Stripe live payment collection is not active.'
  ];
  const checks=[
    {id:'exact_price',complete:hasFinal,description:'Exact final price, applicable taxes and any third-party fees are approved'},
    {id:'within_range',complete:hasFinal&&!outside,description:'Price is inside the recommended package range or exception is documented'},
    {id:'scope',complete:false,description:'Customer and owner approve exact pages, features and integrations'},
    {id:'delivery',complete:false,description:'Delivery criteria, preview approvals, revisions and handover method are agreed'},
    {id:'terms',complete:validDue(due),description:'Written invoice due days, refunds, support and other contract terms are agreed'},
    {id:'privacy',complete:false,description:'Privacy, data use and relevant legal/tax terms have been reviewed'},
    {id:'signatures',complete:false,description:'Customer has accepted the reviewed written quote'}
  ];
  const text=[
    'MAPLEWEB AI | PRIVATE QUOTE DRAFT — NOT SENT OR ACCEPTED','',
    'Customer: '+clean(options.customerName||'To be confirmed'),
    'Project reference: '+clean(options.projectReference||'Private project'),
    '',
    'WEBSITE SCOPE',
    ...scope.map(([name,value])=>name+': '+value),
    '',
    'RECOMMENDED PRICE',
    'Suggested package: '+recommended.label,
    'Published estimate: '+estimate,
    'Proposed agreed total (CAD): '+total,
    outside?'NOTE: Proposed total is outside published range; written explanation and owner review are required.':'',
    'Applicable taxes: Not calculated. Must be identified before acceptance.',
    'Invoice due terms: '+dueText,
    '',
    'PAY AFTER DELIVERY',
    ...terms.map((x,i)=>String(i+1)+'. '+x),
    '',
    'PRE-SIGNING CHECKLIST',
    ...checks.map(x=>(x.complete?'[x] ':'[ ] ')+x.description),
    '',
    'STATUS: DRAFT FOR OWNER REVIEW. NOT A SIGNED CONTRACT, INVOICE OR PAYMENT REQUEST.',
    'No customer email, invoice, website publication or charge has occurred.',
    'Owner must obtain appropriate legal and tax review for applicable Canadian requirements.'
  ].filter(x=>x!=='').join('\n');
  return {
    ok:true,
    status:'OWNER_DRAFT_NOT_SENT',
    currency:'CAD',
    project_reference:clean(options.projectReference||''),
    customer_name:clean(options.customerName||''),
    recommended_package:recommended,
    estimated_range_cad:{min:recommended.min,max:recommended.max},
    proposed_final_total_cad_cents:hasFinal?amount:null,
    price_exception_needs_review:outside,
    amount_not_yet_agreed:!hasFinal,
    invoice_due_days:validDue(due)?due:null,
    deposit_cad_cents:0,
    payment_policy:'AFTER_CONFIRMED_DELIVERY',
    customer_receives_site_before_payment:true,
    taxes_calculated:false,
    owner_review_required:true,customer_acceptance_required:true,
    legal_and_tax_review_required:true,
    quote_sent:false,invoice_created:false,customer_charged:false,
    site_published:false,
    checklist:checks,
    draft_text:text
  };
}
