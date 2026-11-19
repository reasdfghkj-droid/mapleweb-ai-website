/* MapleWeb AI Conversation Studio — friendly, rule-based website planner.
   No generative AI model or automatic publication. Customer data is submitted only with explicit consent.
   Planning answers remain in this page unless the customer chooses secure Developer handoff. */
(function(){
 'use strict';
 const topics=[
   {key:'business',label:'Your business',question:'First, what kind of business do you have?',choices:['Cafe or restaurant','Beauty studio','Home services','Professional services']},
   {key:'goal',label:'Your main goal',question:'What would you like your new website to help you achieve?',choices:['Find more customers','Show my services','Get booking requests','Sell products']},
   {key:'pages',label:'Website pages',question:'How many pages would you like? You can also say you are not sure yet.',choices:['1–2 pages','3–5 pages','5–7 pages','Not sure yet']},
   {key:'features',label:'Features',question:'Which features are most important? For example a contact form, gallery, booking, or an online shop.',choices:['Contact form','Booking','Photo gallery','Online store','Not sure yet']},
   {key:'style',label:'Look and feel',question:'What design style and colours would you like for your website?',choices:['Classic and elegant','Modern and minimal','Green and gold','Warm and welcoming']},
   {key:'timeline',label:'Your timeline',question:'Finally, when would you like your website to be ready?',choices:['As soon as possible','Within a month','1–3 months','Flexible']}
 ];
 const tiers=[
  ['Simple 1–2 pages',500,800],
  ['Simple 3–5 pages',900,1500],
  ['Professional 5–7 pages',1500,2200],
  ['Professional custom design',2300,3000],
  ['Advanced booking or payment',3000,4500],
  ['Advanced online store or integrations',4500,7000]
 ];
 const prices=tiers.map(function(t){return t[0]+': $'+t[1].toLocaleString('en-CA')+'–$'+t[2].toLocaleString('en-CA')+' CAD.';}).join('\n');
 const root=document.querySelector('.chatbox,section.chat');
 const oldLog=document.getElementById('log'),form=document.getElementById('chat-form');
 const oldField=document.getElementById('answer'),send=document.getElementById('send');
 const header=root&&root.querySelector('.chathead,.chatbar'),restart=document.getElementById('restart');
 if(!root||!oldLog||!form||!oldField||!send||!header||!restart)return;
 // Replace the old single-line input with a ChatGPT-style, growing composer.
 const field=document.createElement('textarea');
 field.id='answer';field.name='message';field.rows=1;field.maxLength=600;
 field.setAttribute('aria-label','Message MapleWeb AI');
 field.setAttribute('enterkeyhint','send');
 field.placeholder='Message MapleWeb AI about your website…';
 oldField.replaceWith(field);
 send.textContent='↑';send.setAttribute('aria-label','Send message');send.title='Send message';
 restart.textContent='New chat';restart.title='Start a new private conversation';
 oldLog.classList.add('mw-conversation-log');
 oldLog.setAttribute('role','log');
 oldLog.setAttribute('aria-label','Website planning conversation');
 oldLog.setAttribute('aria-live','polite');
 // Arrange existing working elements in a two-column, responsive conversation shell.
 const layout=document.createElement('div');layout.className='mw-conversation';
 const side=document.createElement('aside');side.className='mw-chat-side';side.setAttribute('aria-label','Website planning progress');
 const logo=document.createElement('div');logo.className='mw-chat-side-logo';
 const emblem=document.createElement('span');emblem.setAttribute('aria-hidden','true');emblem.textContent='✦';
 logo.append(emblem,document.createTextNode('MapleWeb AI'));
 const newButton=document.createElement('button');newButton.className='mw-chat-side-new';
 newButton.type='button';newButton.textContent='+ New chat';
 const sideLabel=document.createElement('div');sideLabel.className='mw-chat-side-label';sideLabel.textContent='Your website plan';
 const steps=document.createElement('ol');steps.className='mw-chat-steps';
 for(const item of topics){const li=document.createElement('li');li.textContent=item.label;steps.append(li);}
 const sideFoot=document.createElement('p');sideFoot.className='mw-chat-side-foot';
 sideFoot.textContent='Private planning. Only your completed website requirements are sent when you choose Developer handoff and give consent.';
 side.append(logo,newButton,sideLabel,steps,sideFoot);
 const main=document.createElement('div');main.className='mw-chat-main';
 const mainTitle=header.querySelector('strong');
 if(mainTitle)mainTitle.textContent='MapleWeb AI';
 let mini=header.querySelector('small');
 if(!mini){mini=document.createElement('small');if(mainTitle)mainTitle.after(mini);}
 mini.textContent='Your personal website planning assistant';
 const status=document.createElement('div');status.className='mw-chat-status';
 status.textContent='Guided conversation · AI model not connected';
 if(mini.parentElement)mini.parentElement.append(status);
 const composer=document.createElement('div');composer.className='mw-chat-composer';
 const footnote=document.createElement('p');footnote.className='mw-chat-footnote';
 footnote.textContent='Your plan is private until you choose Send to Website Developer and give consent';
 composer.append(form,footnote);
 main.append(header,oldLog,composer);layout.append(side,main);root.replaceChildren(layout);
 let answers={},busy=false,previewed=false,submittedReference=null;
 function step(){const i=topics.findIndex(function(t){return !answers[t.key];});return i<0?topics.length:i;}
 function updateProgress(){
  const current=step();
  for(let i=0;i<steps.children.length;i++){
   const item=steps.children[i];item.classList.toggle('is-complete',i<current);
   item.classList.toggle('is-current',i===current);
   if(i===current)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
  }
 }
 function scrollDown(){oldLog.scrollTop=oldLog.scrollHeight;}
 function addMessage(who,content,extraClass){
  const row=document.createElement('div');row.className='mw-chat-message mw-'+who+(extraClass?' '+extraClass:'');
  row.setAttribute('role','group');
  row.setAttribute('aria-label',who==='user'?'You':'MapleWeb AI');
  if(who!=='user'){
   const avatar=document.createElement('div');avatar.className='mw-chat-avatar';
   avatar.textContent='✦';avatar.setAttribute('aria-hidden','true');row.append(avatar);
  }
  const text=document.createElement('div');text.className='mw-chat-text';text.textContent=content;
  row.append(text);oldLog.append(row);scrollDown();return row;
 }
 function removeOptions(){
  oldLog.querySelectorAll('.mw-chat-starters,.mw-chat-options').forEach(function(el){el.remove();});
 }
 function addOptions(items,starter){
  if(!items||!items.length)return;
  const holder=document.createElement('div');
  holder.className=starter?'mw-chat-starters':'mw-chat-options';
  holder.setAttribute('aria-label',starter?'Suggested questions':'Suggested answers');
  for(const value of items){
   const b=document.createElement('button');b.type='button';b.textContent=value;
   b.addEventListener('click',function(){submit(value);});
   holder.append(b);
  }
  oldLog.append(holder);scrollDown();
 }
 function question(){
  const i=step();updateProgress();
  if(i<topics.length){addMessage('assistant',topics[i].question);addOptions(topics[i].choices,false);}
 }
 function reset(){
  answers={};busy=false;previewed=false;submittedReference=null;
  oldLog.replaceChildren();field.value='';field.disabled=false;send.disabled=false;
  addMessage('assistant',"Hello! I'm MapleWeb AI's website planning assistant.\n\nTell me what you want to build, or ask me anything about our website services and prices.");
  addOptions(['How much does a website cost?','When do I pay?','Show me website examples'],true);
  question();updateProgress();resizeField();
 }
 function textSafe(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function looksSensitive(s){
  if(/(?:password|passcode|api[_ -]?key|private[_ -]?key|secret[_ -]?key|access[_ -]?token)\s*(?:is|:|=)\s*\S+/i.test(s))return true;
  const sequences=s.match(/(?:\d[ -]?){13,19}/g)||[];
  return sequences.some(function(x){const digits=x.replace(/\D/g,'');if(digits.length<13||digits.length>19)return false;let sum=0,alternate=false;for(let i=digits.length-1;i>=0;i--){let n=Number(digits[i]);if(alternate){n*=2;if(n>9)n-=9;}sum+=n;alternate=!alternate;}return sum%10===0;});
 }
 function recommendPackage(a){
  const features=String(a.features||'').toLowerCase();
  const goal=String(a.goal||'').toLowerCase();
  const pages=String(a.pages||'').toLowerCase();
  const style=String(a.style||'').toLowerCase();
  if(/online store|online shop|e.?commerce|shop|custom integrat/.test(features)||
     /sell products|online store|e.?commerce/.test(goal))return tiers[5];
  if(/book|payment|reservation/.test(features)||
     /book|reservation/.test(goal))return tiers[4];
  if(/custom premium|premium design|custom design/.test(style)||
     /8\+|8 or more|more than 7/.test(pages))return tiers[3];
  if(/5\s*[–-]\s*7/.test(pages))return tiers[2];
  if(/3\s*[–-]\s*5/.test(pages))return tiers[1];
  return tiers[0];
 }
 function estimateText(){
  const p=recommendPackage(answers);
  return 'Based on your website pages, features and design, the suggested package is '+
   p[0]+' — $'+p[1].toLocaleString('en-CA')+'–$'+p[2].toLocaleString('en-CA')+
   ' CAD. This is an estimate, not a guaranteed final quote. Applicable taxes and any extra services will be confirmed before work starts.';
 }
 function acknowledge(key,value){
  if(key==='business')return 'Thanks, I have noted your business: '+value+'.';
  if(key==='goal')return 'That sounds like a useful goal. I have added it to your plan.';
  if(key==='pages')return 'Great, '+value+' is noted. We can confirm the exact page count later.';
  if(key==='features')return /booking|payment|shop|store|commerce/i.test(value)?
   'Those are useful features. Booking, payments, or stores can involve third-party services and additional costs, which we review before agreeing on a quote.\n\n'+estimateText():
   'I have noted those features. We will review them together before finalizing the quote.\n\n'+estimateText();
  if(key==='style')return 'Your preferred design style is noted.\n\n'+estimateText();
  return 'Thanks. I have noted your preferred timeline; it is not a delivery guarantee.';
 }
 function detectQuestion(s){
  const v=s.trim().toLowerCase();
  const q=/\?|^(what|who|how|where|why|can you|could you|do you|does|is there|tell me|show me|explain|help me|i have a question|hi|hello|hey)\b/.test(v);
  if(!q)return null;
  if(/(?:when\s+(?:do\s+)?(?:i|we)\s+pay|pay\s+after|upfront|deposit|pay\s+first|pay\s+before|payment\s+terms|pay\s+when\s+finished)/.test(v))return 'Our policy is pay after delivery — no deposit. You receive your completed, approved website first. After delivery is confirmed, we request the agreed final payment by invoice. We agree on scope, price, taxes and due date in writing before work starts. Live Stripe invoicing is not active yet.';
  if(/(?:price|pricing|cost|how much|package|charge|afford|cheap)/.test(v))return answers.pages&&answers.features?estimateText():"Tell me the number of pages and features you need, and I will recommend a price range. Our six published packages are:\n\n"+prices+"\n\nThese are estimates, not guaranteed quotes.";
  if(/(?:example|portfolio|sample|preview|demo)/.test(v))return 'You can explore the three illustrative website concepts on our homepage. After completing your plan here, select “Preview sample website” to see a private fixed-template draft. These are examples, not past customer projects.';
  if(/(?:book|booking|online shop|store|e.?commerce|payment feature|checkout)/.test(v))return 'Yes, we can plan a website with bookings, payments, or a shop. These advanced features may involve third-party services, extra costs, and additional review before a quote.';
  if(/(?:timeline|how long|deliver|finish|ready|quick|fast)/.test(v))return 'A website timeline depends on its pages, features, design reviews, and approvals. We will agree on the scope and schedule before work starts.';
  if(/(?:publish|approval|go live|launch)/.test(v))return 'No customer website will be published without the customer and owner approving the current version. Sample previews stay private.';
  if(/(?:send|submit|receive|contact|email|phone|call)/.test(v))return 'After answering the seven website-planning questions, select “Send to Website Developer.” You will add your name, email and any extra instructions, then give consent. If secure intake is not enabled, we will tell you clearly that nothing was sent.';
  if(/(?:chatgpt|are you ai|real ai|language model|human|bot|intelligent)/.test(v))return 'I am a guided website planning assistant with pre-written rules, not a connected generative AI model. I can explain services, answer common website questions, and build a personalized plan from your answers.';
  if(/(?:domain|hosting|seo|google|search engine)/.test(v))return 'We can discuss hosting, domains, and search-friendly design during planning. Any ongoing fees, technical setup, and included services will be confirmed in the quote. Search rankings are not guaranteed.';
  if(/(?:website|build|create|make|design|develop|restaurant|cafe|salon)/.test(v))return 'We can help plan a professional website for that kind of business. Tell me what you do, and I will help work out the pages, features, style, and a suitable price range.';
  if(/^(?:hi|hello|hey|help me)/.test(v))return "Welcome! I can explain MapleWeb AI's services and help you plan your website, one question at a time.";
  return 'I can help with website design, prices, common features, and planning. I do not have a connected general-purpose AI model yet, but I can guide you through your website request.';
 }
 function summary(){
  return 'MapleWeb AI — Your Website Plan\n\n'+
   topics.map(function(t){return t.label+': '+(answers[t.key]||'Not decided');}).join('\n')+
   '\n\n'+estimateText()+'\n'+
   '\n\nPayment policy: No upfront deposit; pay after the finished website has been delivered and handover confirmed. Final price, taxes and due date are agreed in writing first.\n\n'+(submittedReference?'Saved for private Developer review. Reference: '+submittedReference+'. No accepted order or finished website.':'Planning summary only. Not submitted, not a confirmed quote, and not published.')+' Customer and owner approval required.';
 }
 function previewHTML(){
  const business=textSafe(answers.business),goal=textSafe(answers.goal);
  const features=textSafe(answers.features),style=textSafe(answers.style);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;;style-src &apos;unsafe-inline&apos;;base-uri &apos;none&apos;;form-action &apos;none&apos;">'+
   '<title>Private sample website preview</title><style>body{margin:0;background:#f8f5ef;color:#183629;font:16px/1.6 system-ui}header{background:#0d352a;color:#eed4a4;padding:22px 7%;font:1.3rem Georgia,serif}main{padding:55px 7%;max-width:850px;margin:auto}h1{font:clamp(2.3rem,7vw,4.5rem)/1.08 Georgia,serif;letter-spacing:-.035em;margin:15px 0}h2{font:1.65rem Georgia,serif}p{max-width:620px}section{padding:22px;border:1px solid #b9a27f;background:#fff;margin:21px 0;border-radius:10px}.tag{text-transform:uppercase;letter-spacing:.15em;color:#7e6741;font-size:.72rem;font-weight:800}footer{padding:26px 7%;background:#0d352a;color:#f1e4ce;font-size:.83rem}</style></head><body>'+
   '<header>✦ '+business+' · Concept only</header><main><div class="tag">Sample website concept</div><h1>Welcome to '+business+'</h1><p>'+goal+'</p><section><h2>What we offer</h2><p>'+features+'</p></section><section><h2>Our style</h2><p>'+style+'</p></section><p>Imagery, contact details and final content are added after review.</p></main><footer>Private sample from a fixed template. Not a published website, agreed quote, or completed customer project.</footer></body></html>';
 }
 function download(name,content,type){
  const blob=new Blob([content],{type:type||'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},1000);
 }
 function completed(){
  addMessage('assistant','Your website plan and suggested price are ready! Here is what I have recorded:\n\n'+summary()+'\n\nNothing has been submitted, saved, or published. You can copy the plan, save it, or preview a sample design.');
  const controls=document.createElement('div');controls.className='mw-chat-actions';
  function action(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',fn);controls.append(b);}
  action('Copy my plan',async function(){
    try{await navigator.clipboard.writeText(summary());addMessage('assistant','Your website plan was copied.');}
    catch(e){addMessage('assistant','Copy was not available here. You can download the plan instead.');}
  });
  action('Send to Website Developer',function(){
    if(!window.MapleWebHandoff||typeof window.MapleWebHandoff.open!=='function'){
      addMessage('assistant','The secure Developer submission form is unavailable. No information was sent. Save your plan instead.');
      return;
    }
    window.MapleWebHandoff.open({
      host:oldLog,
      getAnswers:function(){return Object.assign({},answers);},
      addMessage:addMessage,
      onSuccess:function(data){submittedReference=data.reference;}
    });
  });
  action('Download plan',function(){download('mapleweb-website-plan.txt',summary());});
  action('Preview sample website',function(){
   if(previewed){addMessage('assistant','Your sample preview is already shown above.');return;}
   previewed=true;
   const wrapper=document.createElement('div');wrapper.className='mw-chat-preview';
   const frame=document.createElement('iframe');frame.title='Private sample website draft';
   frame.setAttribute('sandbox','');frame.setAttribute('referrerpolicy','no-referrer');
   frame.srcdoc=previewHTML();wrapper.append(frame);oldLog.append(wrapper);
   const note=document.createElement('div');note.className='mw-chat-smallnote';note.textContent='Fixed-template preview only. Nothing was submitted or published.';
   oldLog.append(note);
   const save=document.createElement('div');save.className='mw-chat-actions';
   const b=document.createElement('button');b.type='button';b.textContent='Download sample HTML';
   b.addEventListener('click',function(){download('mapleweb-private-sample.html',previewHTML(),'text/html;charset=utf-8');});
   save.append(b);oldLog.append(save);scrollDown();
  });
  oldLog.append(controls);scrollDown();
  // Prepare the optional secure handoff step when planning ends.
  // This checks availability only; no data is sent without customer consent.
  if(window.MapleWebHandoff&&typeof window.MapleWebHandoff.open==='function'){
    window.MapleWebHandoff.open({
      host:oldLog,
      getAnswers:function(){return Object.assign({},answers);},
      addMessage:addMessage,
      onSuccess:function(data){submittedReference=data.reference;}
    });
  }
 }
 function resizeField(){field.style.height='auto';field.style.height=Math.min(155,Math.max(34,field.scrollHeight))+'px';}
 function submit(input){
  const value=String(input===undefined?field.value:input).trim().slice(0,600);
  if(!value||busy)return;
  if(looksSensitive(value)){
   field.value='';resizeField();addMessage('assistant','For your privacy, please do not share passwords, payment card numbers, API keys, or other secrets. Please write your answer without that information.');
   return;
  }
  removeOptions();addMessage('user',value);
  field.value='';resizeField();busy=true;send.disabled=true;
  const typing=addMessage('assistant','Writing a reply…','mw-chat-typing');
  setTimeout(function(){
   typing.remove();
   const intent=detectQuestion(value);
   if(intent){
    const pending=step();
    addMessage('assistant',intent+(pending<topics.length?'\n\nTo continue your website plan: '+topics[pending].question:'\n\nYou can ask another question or start a new chat.'));
    if(pending<topics.length)addOptions(topics[pending].choices,false);
   }else if(step()<topics.length){
    const current=topics[step()];
    answers[current.key]=value;
    const answer=acknowledge(current.key,value);
    const next=step();
    if(next<topics.length){
     addMessage('assistant',answer+'\n\n'+topics[next].question);
     addOptions(topics[next].choices,false);
    }else{addMessage('assistant',answer);completed();}
   }else{
    addMessage('assistant','Your plan is complete. You can ask a website question or start a new chat if you want to plan a different project.');
   }
   updateProgress();busy=false;send.disabled=false;scrollDown();
  },160);
 }
 newButton.addEventListener('click',reset);restart.addEventListener('click',reset);
 form.addEventListener('submit',function(e){e.preventDefault();submit();});
 field.addEventListener('input',resizeField);
 field.addEventListener('keydown',function(e){
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();submit();}
 });
 reset();
})();
