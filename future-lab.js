/* MapleWeb Future Design Lab: illustrative concept switching only.
   No generative AI, personal data collection, storage, network calls or publishing. */
(function(){
 'use strict';
 function init(){
  const lab=document.getElementById('mw-design-lab');
  if(!lab)return;
  const preview=lab.querySelector('#mw-lab-preview');
  const headline=lab.querySelector('#mw-lab-preview-title');
  const name=lab.querySelector('#mw-lab-preview-name');
  const subtitle=lab.querySelector('#mw-lab-preview-description');
  const overline=lab.querySelector('#mw-lab-preview-caption');
  const nav=lab.querySelector('#mw-lab-preview-nav');
  const cta=lab.querySelector('#mw-lab-preview-cta');
  const desktop=lab.querySelector('#mw-lab-view-desktop');
  const mobile=lab.querySelector('#mw-lab-view-mobile');
  const announce=lab.querySelector('#mw-lab-status');
  if(!preview||!headline||!name||!subtitle||!overline||!nav||!cta||!desktop||!mobile||!announce)return;
  const concepts={
   cafe:{name:'HAZEL & OAK',overline:'NEIGHBOURHOOD COFFEE',headline:'A little pause. A lot of warmth.',description:'Beautifully roasted coffee, fresh pastries, and moments worth sharing.',cta:'Explore our menu',nav:'MENU'},
   studio:{name:'SOLA STUDIO',overline:'BEAUTY & WELLNESS',headline:'A softer way to shine.',description:'Thoughtful beauty rituals and a calm space, made just for you.',cta:'Discover our services',nav:'OUR WORK'},
   services:{name:'NORTHLINE',overline:'LOCAL SERVICES',headline:'Better work. Built on trust.',description:'Skilled hands, clear communication, and reliable local service.',cta:'See our services',nav:'PROJECTS'}
  };
  const businesses=lab.querySelectorAll('[data-mw-business]');
  const looks=lab.querySelectorAll('[data-mw-look]');
  let business='cafe',look='luminous';
  function select(nodes,key,active){
   nodes.forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset[key]===active));});
  }
  function render(){
   const concept=concepts[business];
   preview.dataset.business=business;
   preview.dataset.look=look;
   name.textContent=concept.name;
   overline.textContent=concept.overline;
   headline.textContent=concept.headline;
   subtitle.textContent=concept.description;
   cta.textContent=concept.cta;
   nav.textContent=concept.nav;
   select(businesses,'mwBusiness',business);
   select(looks,'mwLook',look);
   announce.textContent=concept.name+' concept shown in '+(look==='luminous'?'Luminous Future':'Modern Classic')+' style.';
  }
  businesses.forEach(function(button){
   button.addEventListener('click',function(){
    const value=button.dataset.mwBusiness;
    if(Object.prototype.hasOwnProperty.call(concepts,value)){business=value;render();}
   });
  });
  looks.forEach(function(button){
   button.addEventListener('click',function(){
    const value=button.dataset.mwLook;
    if(value==='luminous'||value==='classic'){look=value;render();}
   });
  });
  function mode(mobileMode){
   preview.classList.toggle('mw-lab-mobile',mobileMode);
   mobile.setAttribute('aria-pressed',String(mobileMode));
   desktop.setAttribute('aria-pressed',String(!mobileMode));
   announce.textContent=(mobileMode?'Mobile':'Desktop')+' preview showing: '+concepts[business].name+'.';
  }
  desktop.addEventListener('click',function(){mode(false);});
  mobile.addEventListener('click',function(){mode(true);});
  render();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
