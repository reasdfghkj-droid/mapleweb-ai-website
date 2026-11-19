/* MapleWeb AI: explicit customer-consented chat -> Website Developer handoff.
 * No plan or personal information is sent until the customer presses submit.
 * The backend must independently verify Turnstile, consent, origin, rate limits,
 * storage and build-job authorization before returning a saved receipt.
 */
(function(){
'use strict';
var KEY_LIST=['business','goal','pages','features','budget','style','timeline'];
var scriptPromise=null;
var activePanel=null;
function element(tag,cls,text){
  var n=document.createElement(tag);
  if(cls)n.className=cls;
  if(text!==undefined)n.textContent=text;
  return n;
}
function field(label,type,max,required){
  var wrap=element('label','mw-handoff-field');
  var title=element('span','',label),input=document.createElement(type==='textarea'?'textarea':'input');
  if(type==='textarea'){input.rows=4;}else{input.type=type;}
  input.maxLength=max;input.required=Boolean(required);
  input.setAttribute('autocomplete',type==='email'?'email':type==='text'?'name':'off');
  wrap.append(title,input);return {wrap:wrap,input:input};
}
function sensitive(value){
  var v=String(value||'');
  if(/(?:password|passcode|api[_ -]?key|private[_ -]?key|secret[_ -]?key|access[_ -]?token)\s*(?:is|:|=)\s*\S+/i.test(v))return true;
  return (v.match(/(?:\d[ -]?){13,19}/g)||[]).some(function(chunk){
    var digits=chunk.replace(/\D/g,'');if(digits.length<13||digits.length>19)return false;
    var sum=0;
    for(var i=digits.length-1,j=0;i>=0;i--,j++){
      var d=Number(digits.charAt(i));
      if(j%2){d*=2;if(d>9)d-=9;}sum+=d;
    }
    return sum%10===0;
  });
}
function readyScript(){
  if(window.turnstile&&typeof window.turnstile.render==='function')return Promise.resolve();
  if(scriptPromise)return scriptPromise;
  scriptPromise=new Promise(function(resolve,reject){
    var s=document.createElement('script');
    s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async=true;s.defer=true;
    s.onload=function(){window.turnstile&&typeof window.turnstile.render==='function'
      ?resolve():reject(Error('Security widget unavailable'));};
    s.onerror=function(){reject(Error('Security widget could not load'));};
    document.head.append(s);
  });
  return scriptPromise;
}
async function open(options){
  var host=options&&options.host;
  if(!host||typeof host.append!=='function'||typeof options.getAnswers!=='function')return;
  if(activePanel&&activePanel.isConnected){
    activePanel.scrollIntoView({block:'nearest',behavior:'smooth'});return;
  }
  var panel=element('section','mw-handoff-panel');
  activePanel=panel;
  panel.setAttribute('aria-label','Send website project brief to Developer');
  panel.append(element('h3','mw-handoff-heading','Send your website plan to our Developer'));
  panel.append(element('p','mw-handoff-small',
    'You decide what to share. Your seven answers and any extra instructions will be saved securely for a private website draft. No payment or customer-site publication happens here.'));
  var state=element('p','mw-handoff-status','Checking secure Developer connection…');
  state.setAttribute('role','status');state.setAttribute('aria-live','polite');
  panel.append(state);host.append(panel);
  panel.scrollIntoView({block:'nearest',behavior:'smooth'});
  var cfg;
  try{
    var response=await fetch('/api/config',{method:'GET',cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw Error('Unavailable');
    cfg=await response.json();
  }catch{
    state.textContent='Secure Developer handoff is not available. Nothing was sent. Copy or download your plan for now.';
    return;
  }
  if(cfg.submissions_enabled!==true||cfg.builder_handoff_enabled!==true||!cfg.turnstile_site_key){
    state.textContent='Secure Developer handoff is not active yet. Your plan has not been sent. You can still copy or download it.';
    return;
  }
  state.textContent='Secure handoff is available. Review your answers, add anything else, and give permission before sending.';
  var form=element('form','mw-handoff-form');
  form.noValidate=false;
  var name=field('Your name','text',100,true),email=field('Your email','email',200,true);
  name.input.setAttribute('autocomplete','name');
  var notes=field('Anything else the website builder should know? (optional)','textarea',900,false);
  notes.input.placeholder='For example: exact pages, your preferred colours, special features, what customers should see. No passwords or payment details.';
  var grid=element('div','mw-handoff-grid');
  grid.append(name.wrap,email.wrap);
  form.append(grid,notes.wrap);
  var trap=field('Website','text',100,false);
  trap.wrap.className='mw-handoff-honeypot';
  trap.wrap.setAttribute('aria-hidden','true');
  trap.input.tabIndex=-1;trap.input.setAttribute('autocomplete','off');
  form.append(trap.wrap);
  var consent=document.createElement('label');
  consent.className='mw-handoff-consent';
  var check=document.createElement('input');check.type='checkbox';check.required=true;
  consent.append(check,element('span','',
    'I agree to send my name, email and full website requirements to MapleWeb AI for private project preparation and review. I understand this is not a confirmed order or payment.'));
  form.append(consent);
  var security=element('div','mw-handoff-turnstile');
  form.append(security);
  var feedback=element('p','mw-handoff-feedback','Nothing has been sent yet.');
  feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  form.append(feedback);
  var submit=element('button','mw-handoff-submit','Send my plan to Website Developer');
  submit.type='submit';submit.disabled=true;form.append(submit);panel.append(form);
  var securityToken='',widgetId=null;
  try{
    await readyScript();
    if(!panel.isConnected)return;
    widgetId=window.turnstile.render(security,{
      sitekey:cfg.turnstile_site_key,action:'mapleweb_submit',
      callback:function(token){securityToken=token;submit.disabled=false;},
      'expired-callback':function(){securityToken='';submit.disabled=true;},
      'error-callback':function(){securityToken='';submit.disabled=true;feedback.textContent='Security check failed. Please retry.';}
    });
  }catch{
    submit.disabled=true;
    feedback.textContent='The security check could not load. No data was sent. Please save your plan.';
    return;
  }
  form.addEventListener('submit',async function(event){
    event.preventDefault();
    if(submit.disabled)return;
    if(!form.reportValidity()||!check.checked){
      feedback.textContent='Please enter your name and valid email and agree before sending.';return;
    }
    if(!securityToken){feedback.textContent='Please complete the security check.';return;}
    var clean={};
    var current=options.getAnswers();
    for(var i=0;i<KEY_LIST.length;i++){
      var key=KEY_LIST[i];
      clean[key]=typeof current[key]==='string'?current[key].trim().slice(0,300):'';
    }
    clean.additional_details=notes.input.value.trim().slice(0,900);
    var complete=KEY_LIST.every(function(key){return Boolean(clean[key]);});
    if(!complete){feedback.textContent='Your plan is incomplete. Finish the seven planning questions first.';return;}
    if(sensitive(name.input.value)||sensitive(email.input.value)||
       Object.values(clean).some(sensitive)){
      feedback.textContent='Remove any card numbers, passwords, API keys or other secrets before sending.';
      return;
    }
    submit.disabled=true;
    feedback.textContent='Sending your website brief securely…';
    try{
      var result=await fetch('/api/submit',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          name:name.input.value.trim(),email:email.input.value.trim(),
          website:trap.input.value,consent:true,turnstileToken:securityToken,answers:clean
        })
      });
      var data=await result.json();
      if(result.status===201&&data.saved===true&&data.developer_brief_queued===true){
        feedback.textContent='Request saved! Reference: '+data.reference+
          '. Your complete website brief is in the Developer queue for private starter preparation and owner review. This is not a finished website or accepted order.';
        form.querySelectorAll('input,textarea,button').forEach(function(n){n.disabled=true;});
        if(typeof options.addMessage==='function'){
          options.addMessage('assistant','Your website brief was securely saved for the Website Developer. Reference: '+
            data.reference+'. We will review your requirements before work begins. No payment is due.');
        }
        return;
      }
      feedback.textContent=String(data.error||'Your request could not be confirmed. Please download your plan.').slice(0,200);
    }catch{
      feedback.textContent='We could not confirm whether your request was saved. Please save your plan and contact us before sending it again.';
    }
    securityToken='';submit.disabled=true;
    if(widgetId!==null&&window.turnstile&&typeof window.turnstile.reset==='function')window.turnstile.reset(widgetId);
  });
}
window.MapleWebHandoff={open:open};
})();
