/**
 * MapleWeb AI private owner handover quality gate.
 * This is a manual owner attestation with evidence references, NOT independent
 * proof that a customer website was built, deployed, delivered or accepted.
 * Owner and customer approval plus real delivery evidence remain separate.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const checks=[
  'completeWebsiteBuilt',
  'allContractedFeaturesImplemented',
  'customerContactPathsTested',
  'mobileAndAccessibilityReviewed',
  'securityAndPrivacyTested',
  'domainHostingAndOwnershipExplained',
  'backupsAndFilesVerified',
  'customerHandoverPrepared',
  'paidIntegrationsConfirmed',
  'noOpenCriticalDefects'
];
const evidenceFields=[
  'finalArtifactReference','functionalTestReference',
  'securityTestReference','mobileAccessibilityReference',
  'ownershipHandoverReference','customerSupportReference'
];
const methods=['SOURCE_TRANSFER','HOSTED_WEBSITE'];
const evidence=x=>typeof x==='string'&&x.trim().length>=8&&x.length<=180&&
  /^[a-z0-9_./:-]+$/i.test(x.trim()) &&
  !/https?:|password|secret|token|api.?key|card.?number|credential/i.test(x)?
  x.trim():'';
const fail=(reason,blockers=[])=>({ok:false,ready:false,reason,blockers,
  customer_approved:false,website_delivered:false,payment_due:false});

export function validateHandoverEvidence(project,payload) {
  if(!project||!UUID.test(project.id||''))return fail('Invalid project reference');
  if(project.status!=='PREVIEW_READY')return fail('Project must have a verified private preview');
  if(!Number.isSafeInteger(project.current_version)||project.current_version<1||
     !Number.isSafeInteger(project.row_version))
    return fail('Invalid project version');
  if(project.quote_approved_version!==project.current_version||
     !project.quote_accepted_at||project.preview_verified!==1||
     project.security_check_passed!==1||project.outstanding_revisions!==0)
    return fail('Accepted written quote, current preview and security approval are required');
  if(project.invoice_status||project.stripe_invoice_id||project.delivered_at)
    return fail('Cannot create a new pre-delivery QA record after billing or delivery');
  const p=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:{};
  if(p.confirm!=='REVIEW_FINAL_WEBSITE_QA'||
     p.expectedRowVersion!==project.row_version||
     p.currentVersion!==project.current_version)
    return fail('Owner must confirm the exact current project version');
  if(!methods.includes(p.deliveryMethod))
    return fail('Select source transfer or a completed hosted website');
  const failed=checks.filter(k=>p[k]!==true);
  if(failed.length)return fail('Every finished-website QA check must be confirmed',failed);
  const refs=evidenceFields.map(k=>evidence(p[k]));
  if(refs.some(x=>!x)||new Set(refs).size!==refs.length)
    return fail('Enter six distinct verified evidence references (not raw URLs, keys or credentials)');
  return {ok:true,ready:true,project_reference:project.id,
    version:project.current_version,expectedRowVersion:project.row_version,
    method:p.deliveryMethod,
    refs:Object.fromEntries(evidenceFields.map((k,i)=>[k,refs[i]])),
    checks:Object.fromEntries(checks.map(k=>[k,true])),
    customer_approved:false,website_delivered:false,payment_due:false};
}

/** An owner-only, version-matched record; NEVER auto-marks DELIVERED. */
export async function recordDeliveryQualityReview(db,project,payload,at=new Date().toISOString()) {
  if(!db?.prepare||!db?.batch)return fail('Private database unavailable');
  const validated=validateHandoverEvidence(project,payload);
  if(!validated.ok)return validated;
  const fields=validated.refs,version=validated.version,expected=validated.expectedRowVersion;
  const inserts=[
    db.prepare(
      'INSERT INTO delivery_quality_reviews '+
      '(project_id,version,created_at,delivery_method,final_artifact_reference,'+
      'functional_test_reference,security_test_reference,mobile_accessibility_reference,'+
      'ownership_handover_reference,customer_support_reference,checklist_json) '+
      'SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS('+
      "SELECT 1 FROM projects WHERE id=? AND row_version=? AND current_version=? AND status='PREVIEW_READY' "+
      'AND quote_approved_version=? AND quote_accepted_at IS NOT NULL AND preview_verified=1 '+
      'AND security_check_passed=1 AND outstanding_revisions=0 AND delivered_at IS NULL '+
      'AND stripe_invoice_id IS NULL AND invoice_status IS NULL)'
    ).bind(project.id,version,at,validated.method,fields.finalArtifactReference,
      fields.functionalTestReference,fields.securityTestReference,
      fields.mobileAccessibilityReference,fields.ownershipHandoverReference,
      fields.customerSupportReference,JSON.stringify(validated.checks),
      project.id,expected,version,version),
    db.prepare(
      'INSERT INTO project_events(id,project_id,created_at,action,actor,details_json) '+
      'SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM delivery_quality_reviews '+
      'WHERE project_id=? AND version=? AND approved=1)'
    ).bind(crypto.randomUUID(),project.id,at,'OWNER_FINAL_WEBSITE_QA_RECORDED','owner',
      JSON.stringify({version,method:validated.method,website_delivered:false,
        independent_verification:false,customer_approved:false,invoice_sent:false}),
      project.id,version)
  ];
  try{
    const results=await db.batch(inserts);
    if(results?.length!==2||results.some(x=>x?.meta?.changes!==1))
      return fail('Concurrent version change or quality evidence not committed');
    return {ok:true,ready:true,project_reference:project.id,version,
      recorded_at:at,delivery_method:validated.method,
      manual_owner_attestation:true,independently_verified:false,
      customer_approved:false,website_delivered:false,
      invoice_created:false,customer_charged:false,payment_due:false};
  }catch{return fail('Could not record quality review; reload the project (a prior review may exist)');}
}

/** Fail closed until migration 0006 and actual owner evidence are present. */
export async function getDeliveryQualityReadiness(db,project) {
  if(!db?.prepare||!project||!UUID.test(project.id||''))
    return fail('Private delivery-quality storage unavailable');
  if(!['PREVIEW_READY','DELIVERED'].includes(project.status))
    return fail('Project is not at the final review or delivered stage');
  if(!Number.isSafeInteger(project.current_version)||project.current_version<1)
    return fail('Invalid project version');
  if(project.quote_approved_version!==project.current_version||
     !project.quote_accepted_at||project.preview_verified!==1||
     project.security_check_passed!==1||project.outstanding_revisions!==0)
    return fail('Current quote, preview and security checks do not match');
  try{
    const row=await db.prepare(
      'SELECT version,created_at,delivery_method,final_artifact_reference,'+
      'functional_test_reference,security_test_reference,mobile_accessibility_reference,'+
      'ownership_handover_reference,customer_support_reference,checklist_json,approved '+
      'FROM delivery_quality_reviews WHERE project_id=? AND version=?'
    ).bind(project.id,project.current_version).first();
    if(!row||row.version!==project.current_version||row.approved!==1||!methods.includes(row.delivery_method))
      return fail('No approved final website QA record for the current version');
    const verified=JSON.parse(row.checklist_json||'{}');
    if(checks.some(k=>verified[k]!==true))return fail('Final website QA checklist is incomplete');
    const refs=[
      row.final_artifact_reference,row.functional_test_reference,
      row.security_test_reference,row.mobile_accessibility_reference,
      row.ownership_handover_reference,row.customer_support_reference
    ];
    if(refs.some(v=>!evidence(v))||new Set(refs).size!==refs.length)
      return fail('Final website QA references are missing or invalid');
    return {ok:true,ready:true,version:row.version,
      approved_at:row.created_at,delivery_method:row.delivery_method,
      checked_items:checks.length,manual_owner_attestation:true,
      independently_verified:false,customer_approved:false,
      website_delivered:project.status==='DELIVERED',
      payment_due:false};
  }catch{return fail('Final website QA database migration is not configured or data is invalid');}
}

/** Owner-only handover audit text. It is not proof of delivery, nor a website ZIP. */
export async function preparePrivateHandoverSummary(db,project) {
  const quality=await getDeliveryQualityReadiness(db,project);
  if(!quality.ok)return quality;
  const lines=[
    'MAPLEWEB AI - PRIVATE FINAL HANDOVER CHECKLIST (OWNER REVIEW)',
    'Project reference: '+project.id,
    'Website version: '+quality.version,
    'Intended transfer method: '+quality.delivery_method,
    'Owner QA recorded: '+quality.approved_at,
    '',
    ...checks.map(k=>'[x] '+k.replace(/([A-Z])/g,' $1').trim()),
    '',
    'The checks above are manually attested, not independently verified by this application.',
    'This document is NOT a finished customer website, hosting confirmation, contract signature,',
    'customer acceptance, actual delivery receipt, payment request or bank payout.',
    'Check the actual finished website and obtain explicit customer and owner approval',
    'plus recorded receipt before marking the project DELIVERED.',
    'No upfront payment. Invoice may only be reviewed after confirmed delivery.',
    'Status: '+project.status,
    'Invoice sent by this operation: NO'
  ];
  return {ok:true,private_only:true,quality,
    text:lines.join('\n'),customer_contacted:false,
    delivered_by_this_operation:false,invoice_created:false,published:false};
}
