(function(){
'use strict';
const $=id=>document.getElementById(id);
const purposeNames={
 QUOTE:'Confirm written price and scope',
 FINAL_REVIEW:'Approve the finished website review',
 DELIVERY_RECEIPT:'Confirm you received the completed website'
};
const options={
 QUOTE:[['ACCEPT','I accept the written quote and agreed payment terms'],['REQUEST_CHANGES','I need changes before accepting']],
 FINAL_REVIEW:[['APPROVE','I approve this finished website version'],['REQUEST_CHANGES','I request website revisions']],
 DELIVERY_RECEIPT:[['RECEIVED','I confirm I received the completed website']]
};
const token=location.pathname.startsWith('/review/')?location.pathname.slice('/review/'.length):'';
let purpose=null,version=null,complete=false;
const status=(text)=>{$('reviewStatus').textContent=text;};
function hide(){
 $('reviewDetails').hidden=true;$('reviewSubmit').disabled=true;
}
async function load(){
 hide();
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)){status('Invalid private review link.');return;}
 let response;
 try{response=await fetch('/api/customer/review/'+token,{cache:'no-store',credentials:'same-origin'});}
 catch{status('Unable to connect. Please ask MapleWeb AI for a fresh review link.');return;}
 let data;
 try{data=await response.json()}catch{status('The review service is unavailable.');return;}
 if(!response.ok||!data.ok){status('This private review link is expired, already used or not available. Ask MapleWeb AI for a new link.');return;}
 if(!options[data.purpose]){status('This link has an unknown review purpose.');return;}
 purpose=data.purpose;version=data.version;
 $('reviewHeading').textContent=purposeNames[purpose];
 $('reviewPurpose').textContent=purposeNames[purpose];
 $('reviewVersion').textContent=String(version);
 $('reviewAmount').textContent=Number.isSafeInteger(data.total_cad_cents)?
  '$'+(data.total_cad_cents/100).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2})+' CAD':
  'Already agreed, or not applicable to this review';
 $('reviewTerms').textContent=Number.isSafeInteger(data.invoice_due_days)?
  'Pay after completed delivery; invoice due '+data.invoice_due_days+' days after issue, if agreed':
  'No payment now; any invoice requires completed delivery';
 $('reviewCaution').textContent=purpose==='QUOTE'?
  'Read the separate full written quote, including taxes, services, delivery terms, and any additional costs. This review form is not a digital signature.':
  purpose==='FINAL_REVIEW'?
  'Check the actual finished website and the separately provided full handover information before approving it. A starter template alone is not a completed website.':
  'Confirm only after you have ACTUALLY received the complete approved website, files or hosted access. This confirmation is not a payment.';
 const select=$('reviewDecision');select.replaceChildren();
 for(const [value,label] of options[purpose]){
  const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);
 }
 if(data.download_available===true){
   $('downloadSection').hidden=false;
   $('downloadFinalSite').href='/api/customer/review/'+token+'/download';
 }else{$('downloadSection').hidden=true;$('downloadFinalSite').removeAttribute('href');}
 $('reviewDetails').hidden=false;$('reviewSubmit').disabled=false;
 status('Review the separate written terms or finished website, then choose your decision.');
}
$('reviewDecision').addEventListener('change',()=>{
 $('reviewNote').required=$('reviewDecision').value==='REQUEST_CHANGES';
});
$('reviewForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(complete)return;
 if(!$('reviewForm').reportValidity())return;
 const decision=$('reviewDecision').value;
 const note=$('reviewNote').value.trim();
 if(decision==='REQUEST_CHANGES'&&note.length<8){
  status('Please explain the requested changes in at least eight characters.');return;
 }
 if(!window.confirm('Submit this decision for version '+version+'? This cannot be changed with the same review link.'))return;
 $('reviewSubmit').disabled=true;status('Submitting your private decision…');
 try{
  const r=await fetch('/api/customer/review/'+token,{
   method:'POST',cache:'no-store',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({version,decision,confirm:decision,consent:true,note})
  });
  const data=await r.json();
  if(r.ok&&data.ok){
   complete=true;$('reviewDetails').hidden=true;
   $('reviewHeading').textContent='Decision recorded';
   status(data.next_step+' No invoice, charge or website publication happened through this form.');
  }else{
   $('reviewSubmit').disabled=false;
   status(data.error||'We could not confirm your decision. Contact MapleWeb AI before trying again.');
  }
 }catch{
  status('We could not verify whether your decision was recorded. Please contact MapleWeb AI before resubmitting.');
 }
});
load();
})();