/* MapleWeb progressive planning UI: no external calls, no customer data storage. */
(function(){
 'use strict';
 function init(){
  const log=document.getElementById('log'),form=document.getElementById('chat-form'),field=document.getElementById('answer');
  if(!log||!form||!field)return;
  const shell=form.closest('.chatbox,.chat'),head=shell&&shell.querySelector('.chathead,.chatbar');
  if(!head)return;
  const progress=document.createElement('div');
  progress.className='mw-progress';
  const row=document.createElement('div');row.className='mw-progress-row';
  const label=document.createElement('strong');label.textContent='Step 1 of 7';
  const privacy=document.createElement('span');privacy.textContent='Private · nothing sent';
  row.append(label,privacy);
  const bar=document.createElement('progress');bar.max=7;bar.value=0;bar.setAttribute('aria-label','Questions answered');
  progress.append(row,bar);head.insertAdjacentElement('afterend',progress);
  const quick=document.createElement('div');quick.className='mw-replies';quick.setAttribute('aria-label','Suggested answers');form.before(quick);
  const choices={
    2:['1–2 pages','3–5 pages','5–7 pages','Not sure yet'],
    3:['Contact form','Booking','Online store','Photo gallery','Not sure yet'],
    4:['$500–$800','$900–$1,500','$1,500–$2,200','$2,300–$3,000','Not sure yet'],
    5:['Classic and elegant','Modern and minimal','Luxury green and gold','Warm and welcoming'],
    6:['As soon as possible','Within a month','1–3 months','Flexible']
  };
  function render(){
    const count=Math.min(7,log.querySelectorAll('.bubble.user').length);
    bar.value=count;label.textContent=count===7?'Your plan is ready':'Step '+(count+1)+' of 7';
    quick.replaceChildren();
    if(field.disabled||!choices[count])return;
    for(const value of choices[count]){
      const btn=document.createElement('button');btn.type='button';btn.textContent=value;
      btn.addEventListener('click',()=>{if(field.disabled)return;field.value=value;
        if(form.requestSubmit)form.requestSubmit();else form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
      quick.append(btn);
    }
    const help=document.createElement('small');help.textContent='Choose an option or type your answer.';quick.append(help);
  }
  let scheduled=false;
  const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;render()})});
  observer.observe(log,{childList:true});
  render();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
