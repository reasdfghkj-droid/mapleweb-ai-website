(function(){
'use strict';
const $=id=>document.getElementById(id);
let token='',current=null,canDeleteAbandoned=false;
const notice=(message,bad=false)=>{
  $('actionFeedback').textContent=message;
  $('actionFeedback').classList.toggle('error',bad);
};
const status=(message,bad=false)=>{
  $('status').textContent=message;
  $('status').classList.toggle('error',bad);
};
async function api(path,body){
  if(!token)throw Error('Connect with your private token first.');
  const init={method:body?'POST':'GET',headers:{authorization:'Bearer '+token},cache:'no-store',credentials:'same-origin'};
  if(body){init.headers['Content-Type']='application/json';init.body=JSON.stringify(body)}
  const r=await fetch(path,init);
  let json;
  try{json=await r.json()}catch{throw Error('Manager response unavailable (HTTP '+r.status+')')}
  if(!r.ok)throw Error(String(json.error||'Manager request failed').slice(0,180));
  return json;
}
function cell(tag,text,parent,cls){
  const n=document.createElement(tag);n.textContent=text??'—';
  if(cls)n.className=cls;
  parent.append(n);return n;
}
async function loadInbox(){
  const inbox=$('inbox');const result=await api('/api/manager/notifications');
  inbox.replaceChildren();
  if(!result.notifications?.length){cell('p','No new project notices.',inbox,'muted');return;}
  for(const n of result.notifications){
    const box=document.createElement('div');box.className='project';
    cell('strong',n.category.replaceAll('_',' ')+' · '+n.status,box);
    cell('span',new Date(n.created_at).toLocaleString('en-CA')+(n.read_at?' · Reviewed':' · New'),box);
    const open=document.createElement('button');open.type='button';open.className='secondary';open.textContent='Open project';
    open.addEventListener('click',()=>load(n.project_id));box.append(open);
    if(!n.read_at){
      const read=document.createElement('button');read.type='button';read.className='secondary';read.textContent='Mark read';
      read.addEventListener('click',async()=>{
        try{await api('/api/manager/notifications/'+n.id+'/read',{confirm:'MARK_NOTIFICATION_READ'});await loadInbox();}
        catch(e){notice(e.message,true);}
      });box.append(read);
    }
    inbox.append(box);
  }
}
async function refresh(){
  const results=await api('/api/manager/projects');
  const list=$('projects');list.replaceChildren();
  if(!results.projects?.length){cell('p','No customer projects have been saved yet.',list,'muted');return;}
  for(const p of results.projects){
    const b=document.createElement('button');b.type='button';b.className='project';b.setAttribute('role','listitem');
    b.setAttribute('aria-pressed',p.id===current?.id?'true':'false');
    cell('strong',p.name||'Customer',b);
    cell('span',p.status+' · '+new Date(p.created_at).toLocaleDateString('en-CA'),b);
    b.addEventListener('click',()=>load(p.id));list.append(b);
  }
}
async function refreshQueue(){
  const data=await api('/api/manager/build-queue');
  const wrap=$('agentQueue');wrap.replaceChildren();
  $('queueCount').textContent='Pending: '+data.queued+' · In progress: '+data.building+' · Need attention: '+data.failed;
  if(!data.jobs?.length){cell('p','No Developer Agent jobs yet.',wrap,'muted');return;}
  for(const job of data.jobs){
    const b=document.createElement('button');b.type='button';b.className='project';
    cell('strong',job.status+' · '+job.generator,b);
    cell('span','Project '+job.project_id.slice(0,8)+' · '+job.project_status,b);
    b.addEventListener('click',()=>load(job.project_id));wrap.append(b);
  }
}
async function load(id){
  try{
    const data=await api('/api/manager/projects/'+id);
    current=data.project;
    const qa=data.delivery_quality||{};
    $('deliveryQaStatus').textContent=qa.ready
      ?'Owner QA recorded for version '+qa.version+' · '+qa.delivery_method+
        '. Customer acceptance and actual delivery still require separate evidence.'
      :'Not ready to record delivery: '+(qa.reason||'Final QA review missing');
    $('saveDeliveryQA').disabled=current.status!=='PREVIEW_READY'||qa.ready===true;
    $('downloadHandoverSummary').disabled=qa.ready!==true;
    const builder=data.developer_build||{};
    $('builderStatus').textContent=builder.ok
      ?'Developer job: '+builder.status+' · '+(builder.generator||'fixed-template')+
       '. This is a private starter draft, NOT a completed customer website.'
      :'No Developer build job was found for this project.';
    $('processBuilder').disabled=builder.status!=='QUEUED';
    $('downloadBuilder').disabled=builder.status!=='STARTER_READY';
    $('markStalledBuild').disabled=builder.status!=='BUILDING';
    $('retryTemplate').disabled=!(builder.status==='FAILED'&&
      builder.generator==='fixed-template'&&builder.attempts===1&&
      builder.manual_retries===0&&['NEW','REVIEWING'].includes(current.status));
    canDeleteAbandoned=data.abandoned_delete_eligibility?.allowed===true;
    $('deleteAbandoned').disabled=!canDeleteAbandoned;
    const details=$('details');details.replaceChildren();
    cell('h2',current.name||'Project details',details);
    const dl=document.createElement('dl');dl.className='detailsGrid';
    for(const [name,value] of [
      ['Reference',current.id],['Email',current.email],['Status',current.status],
      ['Draft version',current.current_version],['Draft type',current.generator],
      ['Amount (CAD)',Number.isSafeInteger(current.approved_final_total_cad_cents)?'$'+(current.approved_final_total_cad_cents/100).toFixed(2):'Awaiting signed quote'],
      ['Invoice',current.invoice_status||'Not created']
    ]){cell('dt',name,dl);cell('dd',String(value??'—'),dl);}
    details.append(dl);
    if(current.answers&&typeof current.answers==='object'){
      cell('h3','Customer requirements',details);
      const a=document.createElement('dl');a.className='detailsGrid';
      for(const [k,v] of Object.entries(current.answers)){cell('dt',k,a);cell('dd',String(v).slice(0,400),a);}
      details.append(a);
    }
    if(typeof current.draft_html==='string'&&current.draft_html.length){
      cell('h3','Private draft preview (unpublished)',details);
      const frame=document.createElement('iframe');
      frame.className='preview';frame.title='Sandboxed customer draft preview';
      frame.setAttribute('sandbox','');frame.setAttribute('referrerpolicy','no-referrer');
      frame.srcdoc=current.draft_html;details.append(frame);
    }
    $('actions').hidden=false;
    $('invoiceAssessment').textContent=(
      data.invoice_eligibility?.eligibleForOwnerDraftInvoice
        ? 'All post-delivery checks passed. Only a reviewed sandbox draft can be created when enabled.'
        : 'Invoice blocked: '+(data.invoice_eligibility?.blockers||[]).join('; ')
    );
    await Promise.all([refresh(),refreshQueue()]);
    notice('Project loaded. Actions use current version '+current.row_version+'.');
  }catch(e){notice(e.message,true);}
}
$('connect').addEventListener('click',async()=>{
  const proposed=$('token').value;
  if(!proposed||proposed.length<32){status('A valid private Manager token is required.',true);return;}
  token=proposed;$('token').value='';
  try{
    const result=await api('/api/manager/status');
    if(!result.manager_only)throw Error('Manager status could not be verified.');
    $('workspace').hidden=false;$('disconnect').disabled=false;
    status('Connected to protected MapleWeb AI Manager. Private data stays in this tab.');
    await Promise.all([refresh(),loadInbox(),refreshQueue()]);
  }catch(e){token='';$('workspace').hidden=true;status(e.message,true);}
});
$('disconnect').addEventListener('click',()=>{
  token='';current=null;$('workspace').hidden=true;$('disconnect').disabled=true;
  $('projects').replaceChildren();$('details').replaceChildren();$('inbox').replaceChildren();$('agentQueue').replaceChildren();$('previewUrl').value='';
  status('Disconnected. The token was cleared from memory.');
});
$('refresh').addEventListener('click',()=>refresh().catch(e=>notice(e.message,true)));
$('refreshInbox').addEventListener('click',()=>loadInbox().catch(e=>notice(e.message,true)));
$('refreshQueue').addEventListener('click',()=>refreshQueue().catch(e=>notice(e.message,true)));
$('runTemplateBatch').addEventListener('click',async()=>{
  if(!window.confirm('Prepare up to 2 PRIVATE fixed-template drafts? This requires the separately approved batch flag. AI charges, publishing, emails and payments remain disabled.'))return;
  try{
    const x=await api('/api/manager/run-template-batch',{
      confirm:'RUN_APPROVED_PRIVATE_TEMPLATE_BATCH',limit:2
    });
    notice('Processed '+x.attempted+' queued jobs; '+x.starters_ready+' private starters prepared.');
    await Promise.all([refresh(),refreshQueue(),loadInbox()]);
  }catch(e){notice(e.message,true);}
});
$('record').addEventListener('click',async()=>{
  if(!current)return;
  const action=$('action').value;if(!action){notice('Choose a stage first.',true);return;}
  const body={action,expectedRowVersion:current.row_version};
  if(action==='QUOTED'){
    body.approvedFinalTotalCadCents=Math.round(Number($('finalAmount').value)*100);
    body.invoiceDueDays=Number($('dueDays').value);
    body.quoteEvidenceReference=$('quoteEvidence').value.trim();
  }
  if(action==='ACCEPTED')body.customerQuoteAcceptanceReference=$('acceptedEvidence').value.trim();
  if(action==='REVISE')body.revisionEvidenceReference=$('revisionEvidence').value.trim();
  if(action==='PREVIEW_READY'){
    body.previewVerified=$('previewCheck').checked;body.securityCheckPassed=$('securityCheck').checked;
  }
  if(action==='DELIVERED'){
    body.currentVersion=current.current_version;
    body.customerApproved=$('customerApproved').checked;body.ownerApproved=$('ownerApproved').checked;
    body.customerApprovalEvidenceReference=$('customerEvidence').value.trim();
    body.deliveryEvidenceReference=$('deliveryEvidence').value.trim();
    body.customerReceiptEvidenceReference=$('receiptEvidence').value.trim();
  }
  try{
    const x=await api('/api/manager/projects/'+current.id+'/transition',body);
    if(!x.ok)throw Error(x.reason||'Stage change not recorded');
    notice('Stage recorded: '+x.status);await load(current.id);
  }catch(e){notice(e.message,true);}
});
$('aiDraft').addEventListener('click',async()=>{
  if(!current)return;
  const allow=window.confirm('Create a new private AI draft only if Workers AI inference is enabled and approved? This does not publish anything and may incur AI usage charges.');
  if(!allow)return;
  try{
    const d=await api('/api/manager/projects/'+current.id+'/improve-draft',{});
    if(!d.ok)throw Error(d.reason||'Draft was not generated');
    notice('Private AI draft prepared for owner review.');await load(current.id);
  }catch(e){notice(e.message,true);}
});
$('downloadStarter').addEventListener('click',async()=>{
  if(!current)return;
  try{
    const bundle=await api('/api/manager/projects/'+current.id+'/bundle');
    if(!Array.isArray(bundle.files)||!bundle.files.length)throw Error('No files returned');
    const blob=new Blob([JSON.stringify(bundle,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='mapleweb-private-starter-'+current.id.slice(0,8)+'.json';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    notice('Private starter source downloaded (not published).');
  }catch(e){notice(e.message,true);}
});
$('createPreview').addEventListener('click',async()=>{
  if(!current)return;
  if(!window.confirm('Create a private 48-hour preview link for the intended customer? Share it securely. Anyone holding the link can view the approved sample until expiry or revocation.'))return;
  try{
    const result=await api('/api/manager/projects/'+current.id+'/preview-share',{
      confirm:'CREATE_PRIVATE_CUSTOMER_PREVIEW',expectedRowVersion:current.row_version,hours:48
    });
    if(!result.ok)throw Error(result.error||'Preview sharing is unavailable');
    $('previewUrl').value=result.url;
    notice('Short-lived private draft link created. It is shown only once, not emailed or published.');
  }catch(e){notice(e.message,true);}
});
$('revokePreviews').addEventListener('click',async()=>{
  if(!current)return;
  if(!window.confirm('Revoke ALL current private preview links for this project immediately?'))return;
  try{
    const x=await api('/api/manager/projects/'+current.id+'/preview-revoke',{confirm:'REVOKE_ALL_CUSTOMER_PREVIEW_LINKS'});
    $('previewUrl').value='';
    notice('Revoked '+(x.revoked_count||0)+' private preview link(s).');
  }catch(e){notice(e.message,true);}
});
$('clearPreview').addEventListener('click',()=>{$('previewUrl').value='';});
$('deleteAbandoned').addEventListener('click',async()=>{
  if(!current||!canDeleteAbandoned)return;
  const id=current.id;
  const typed=window.prompt('Deleting this abandoned lead removes its private drafts and notices. Type DELETE to confirm. This does not email the customer.');
  if(typed!=='DELETE')return;
  try{
    const x=await api('/api/manager/projects/'+id+'/delete-request',{
      confirm:'DELETE_ABANDONED_REQUEST',projectReference:id,expectedRowVersion:current.row_version
    });
    if(!x.deleted)throw Error(x.error||'Deletion not verified');
    current=null;canDeleteAbandoned=false;
    $('actions').hidden=true;$('previewUrl').value='';
    const details=$('details');details.replaceChildren();
    cell('h2','Abandoned request deleted',details);
    cell('p','Related private drafts and in-app notices were removed. No customer email was sent.',details);
    await Promise.all([refresh(),loadInbox()]);
    notice('Deleted abandoned request after owner confirmation.');
  }catch(e){notice(e.message,true);}
});
$('processBuilder').addEventListener('click',async()=>{
  if(!current)return;
  if(!window.confirm('Prepare a PRIVATE website draft from the consented brief? If owner-approved AI Developer is active, AI usage costs may apply. No site will be published or customer charged.'))return;
  try{
    const x=await api('/api/manager/projects/'+current.id+'/process-build',{
      confirm:'PROCESS_PRIVATE_STARTER_ONLY',expectedRowVersion:current.row_version
    });
    if(!x.ok)throw Error(x.reason||'Developer queue is unavailable');
    notice('Private Developer starter prepared for owner review. No publication or payment.');
    await load(current.id);
  }catch(e){notice(e.message,true);}
});
$('markStalledBuild').addEventListener('click',async()=>{
  if(!current||!window.confirm('Mark this job FAILED only if it has been stuck for 30+ minutes? This does NOT restart AI or charge anyone.'))return;
  try{
    const x=await api('/api/manager/projects/'+current.id+'/mark-stalled-build',{
      confirm:'MARK_STALLED_JOB_FAILED',expectedRowVersion:current.row_version
    });
    if(!x.ok)throw Error(x.error||'Stalled job review blocked');
    notice('Stalled job marked FAILED; owner review required. No automatic retries.');
    await load(current.id);
  }catch(e){notice(e.message,true);}
});
$('retryTemplate').addEventListener('click',async()=>{
  if(!current||!window.confirm('Retry this FAILED fixed-template job ONCE? Paid AI jobs cannot be retried here.'))return;
  try{
    const x=await api('/api/manager/projects/'+current.id+'/retry-template',{
      confirm:'RETRY_FAILED_TEMPLATE_ONCE',expectedRowVersion:current.row_version
    });
    if(!x.ok)throw Error(x.error||'Template retry blocked');
    notice('A single template-only retry is queued; no AI charges or website publishing.');
    await load(current.id);
  }catch(e){notice(e.message,true);}
});
$('downloadBuilder').addEventListener('click',async()=>{
  if(!current)return;
  try{
    const x=await api('/api/manager/projects/'+current.id+'/builder-output');
    if(!x.ok||!x.bundle)throw Error(x.error||'Developer output not ready');
    const blob=new Blob([JSON.stringify(x.bundle,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='mapleweb-developer-starter-'+current.id.slice(0,8)+'.json';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    notice('Private Developer starter downloaded for review.');
  }catch(e){notice(e.message,true);}
});
$('downloadQuote').addEventListener('click',async()=>{
  if(!current)return;
  try{
    const x=await api('/api/manager/projects/'+current.id+'/quote-pack');
    if(!x.ok||!x.draft_text)throw Error(x.error||'Quote draft unavailable');
    const blob=new Blob([x.draft_text],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='mapleweb-owner-quote-'+current.id.slice(0,8)+'.txt';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    notice('Private quote draft downloaded. Review taxes, price, services and customer acceptance before sending.');
  }catch(e){notice(e.message,true);}
});
$('saveDeliveryQA').addEventListener('click',async()=>{
  if(!current||current.status!=='PREVIEW_READY')return;
  if(!window.confirm('I confirm a COMPLETE finished website exists, and I personally reviewed the listed evidence. This is NOT customer approval, real delivery or an invoice.'))return;
  const values={
    deliveryMethod:$('qaMethod').value,
    finalArtifactReference:$('qaFinalArtifact').value.trim(),
    functionalTestReference:$('qaFunctionalTest').value.trim(),
    securityTestReference:$('qaSecurityTest').value.trim(),
    mobileAccessibilityReference:$('qaMobileTest').value.trim(),
    ownershipHandoverReference:$('qaOwnership').value.trim(),
    customerSupportReference:$('qaSupport').value.trim(),
    completeWebsiteBuilt:$('qaCompleteSite').checked,
    allContractedFeaturesImplemented:$('qaAllFeatures').checked,
    customerContactPathsTested:$('qaContacts').checked,
    mobileAndAccessibilityReviewed:$('qaAccessibility').checked,
    securityAndPrivacyTested:$('qaSecurity').checked,
    domainHostingAndOwnershipExplained:$('qaOwnershipExplained').checked,
    backupsAndFilesVerified:$('qaBackup').checked,
    customerHandoverPrepared:$('qaHandover').checked,
    paidIntegrationsConfirmed:$('qaPaidIntegrations').checked,
    noOpenCriticalDefects:$('qaNoDefects').checked,
    currentVersion:current.current_version,
    expectedRowVersion:current.row_version,
    confirm:'REVIEW_FINAL_WEBSITE_QA'
  };
  try{
    const result=await api('/api/manager/projects/'+current.id+'/delivery-review',values);
    if(!result.ok)throw Error(result.reason||'Final website QA review blocked');
    notice('Owner QA recorded for version '+result.version+
      '. Obtain separate customer and owner approval plus delivery receipt before invoice eligibility.');
    await load(current.id);
  }catch(e){notice(e.message,true);}
});
$('downloadHandoverSummary').addEventListener('click',async()=>{
  if(!current)return;
  try{
    const result=await api('/api/manager/projects/'+current.id+'/handover-summary');
    if(!result.ok||!result.text)throw Error(result.reason||'Handover checklist unavailable');
    const blob=new Blob([result.text],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='mapleweb-private-handover-'+current.id.slice(0,8)+'.txt';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    notice('Private QA checklist saved for review; it is not proof of delivery or payment.');
  }catch(e){notice(e.message,true);}
});
$('approveInvoice').addEventListener('click',async()=>{
  if(!current)return;
  if(!window.confirm('Confirm the customer received the approved final website and you reviewed the final invoice amount and agreed terms?'))return;
  try{
    const x=await api('/api/manager/projects/'+current.id+'/approve-invoice',{
      confirm:'APPROVE_POST_DELIVERY_INVOICE',expectedRowVersion:current.row_version
    });
    notice(x.approved_for_draft_review?'Invoice review approved; no invoice was sent.':'Invoice approval incomplete');
    await load(current.id);
  }catch(e){notice(e.message,true);}
});
$('sandboxInvoice').addEventListener('click',async()=>{
  if(!current)return;
  if(!window.confirm('Create a STRIPE TEST-MODE DRAFT ONLY? No customer receives an email or charge. This is disabled without sandbox credentials and authorization.'))return;
  try{
    const x=await api('/api/manager/projects/'+current.id+'/draft-test-invoice',{
      confirm:'CREATE_STRIPE_SANDBOX_DRAFT_ONLY',expectedRowVersion:current.row_version
    });
    if(!x.ok)throw Error(x.error||'No draft created');
    notice('Stripe TEST draft created: '+x.invoice_id+'. NOT sent, paid, or finalized.');
    await load(current.id);
  }catch(e){notice(e.message,true);}
});
})();
