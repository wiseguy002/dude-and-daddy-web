(function(){
  var root=document.documentElement, K='dd-shift', btn=document.getElementById('shift');
  function store(v){try{localStorage.setItem(K,v)}catch(e){}}
  var m=/[?&]shift=(dark|light)/.exec(location.search), saved=null;
  try{saved=localStorage.getItem(K)}catch(e){}
  if(m){root.setAttribute('data-theme',m[1]);store(m[1]);}
  else if(saved==='dark'||saved==='light'){root.setAttribute('data-theme',saved);}
  function dark(){var t=root.getAttribute('data-theme');if(t)return t==='dark';return !!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);}
  function label(){var d=dark();btn.textContent=d?'Day shift':'Night shift';btn.setAttribute('aria-pressed',d?'true':'false');}
  label();
  btn.addEventListener('click',function(){var n=dark()?'light':'dark';root.setAttribute('data-theme',n);store(n);label();});
  document.addEventListener('click',function(e){
    var a=e.target.closest&&e.target.closest('a[data-x]'); if(!a)return;
    var t=root.getAttribute('data-theme'); if(!t)return;
    try{var u=new URL(a.href);u.searchParams.set('shift',t);a.href=u.href;}catch(x){}
  });
})();
/* 📢 the PA bar, 🎃 seasons and 🥚 secrets (both sites share this file) */
(function(){
  var root=document.documentElement, bar=document.getElementById('pabar');
  function easter(y){var a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;return new Date(y,Math.floor(n/31)-1,n%31+1);}
  function seasonOf(d){
    var m=d.getMonth(),day=d.getDate(),e=easter(d.getFullYear()),days=(e-new Date(d.getFullYear(),m,day))/864e5;
    if(days>=0&&days<=14)return 'easter';
    if(m===9)return 'halloween'; if(m===10)return 'thanksgiving';
    if(m===11&&day<=26)return 'christmas'; if((m===11&&day>26)||(m===0&&day<=3))return 'newyear';
    if(m===1&&day<=14)return 'valentines'; return '';
  }
  var ICON={halloween:'🎃',thanksgiving:'🦃',christmas:'🎄',newyear:'🎆',valentines:'💘',easter:'🐰'};
  var forced=/[?&]season=([a-z]*)/.exec(location.search), s=forced?forced[1]:seasonOf(new Date());
  if(!ICON[s])s='';
  if(s){root.setAttribute('data-season',s);var b=document.querySelector('.sitehead .brand b');if(b)b.insertAdjacentText('beforeend',' '+ICON[s]);}
  var SEASON_MSG={
    halloween:['Happy Halloween, shoppers. Mr. Gristle says the candy is NOT for employees.','Cleanup on aisle 13. Please do not make eye contact with the pumpkins.'],
    thanksgiving:['Attention shoppers: Tom the turkey would like you to know he is just browsing.','The pie aisle is open. Please walk, do not gobble.'],
    christmas:['Cleanup on aisle 12: someone wrapped a gift inside another gift. Again.','Naughty elves have been spotted near the toy aisle. Please report them.'],
    newyear:['Attention shoppers: the store clock is running a little fast. Happy New Year.','Countdown Carl has begun counting. Nobody knows from what.'],
    valentines:['Cleanup on aisle 14: a singing card will not stop. Please send help.','Retired Cupid reminds you his back hurts. Please be gentle.'],
    easter:['The egg hunt is on. Please do not eat the rotten ones.','Peep the chick has wandered off again. If found, please return to aisle 5.']
  };
  var MSG=[
    'Cleanup on aisle 3. Cleanup on aisle 4. Honestly, just clean up everywhere.',
    'Attention, shoppers: the Wet Floor sign IS the wet floor. Please do not lick it.',
    'Mr. Whiskers has been promoted to manager. Please address him as sir.',
    'Rusty the cart is not available for rides. Rusty would like that noted.',
    'A reminder from the PA: I can hear you. I can always hear you.',
    'Karen Krumb is looking for the manager. She is the manager. She is looking in the mirror.',
    'Big Deb says drop and give her twenty mops. She means it.',
    'Free samples are in aisle 7. Please do not ask what the samples are.',
    'Maurice the Mop Ghost wants you to remember to wring the mop. Out loud, if possible.',
    'Attention, night clerks: the coffee is for night clerks. The ghost is not a night clerk.',
    'This is your friendly store intercom. Please enjoy your visit. Or don’t. I am a speaker, not a cop.',
    'Dude and Daddy would like to thank you for shopping at Fresh Mart. Mop included.'
  ];
  if(!bar)return;
  var msg=document.getElementById('pamsg'),pause=document.getElementById('papause');
  var list=(SEASON_MSG[s]||[]).concat(MSG),i=Math.floor(Math.random()*list.length),timer=null,paused=false;
  var still=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function show(){msg.textContent=list[i%list.length];}
  function tick(){i++;show();}
  function start(){if(!timer&&!paused&&!still)timer=setInterval(tick,7000);}
  function stop(){clearInterval(timer);timer=null;}
  show();start();
  if(pause){pause.addEventListener('click',function(){paused=!paused;pause.textContent=paused?'▶':'⏸';pause.setAttribute('aria-label',paused?'Resume announcements':'Pause announcements');if(paused)stop();else{tick();start();}});}
  bar.addEventListener('mouseenter',stop);bar.addEventListener('mouseleave',start);
  bar.addEventListener('focusin',stop);bar.addEventListener('focusout',start);
})();
(function(){
  var K='dd-secrets',buf='',kbuf=[],KONAMI='ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,b,a';
  var still=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SECRETS={
    SQUEAKY:{icon:'🛒',say:'Rusty rolls by. *squeak squeak*',fx:'cart'},
    MAURICE:{icon:'👻',say:'Maurice floats past with a mop. Pro tip: he is not hiring.',fx:'ghost'},
    WETFLOOR:{icon:'⚠️',say:'CAUTION: wet floor. You were warned.',fx:'sign'},
    MOPTIME:{icon:'🧹',say:'Big Deb approves. Twenty mops, as ordered.',fx:'mops'},
    KONAMI:{icon:'🏆',say:'Employee of the Month: you. The plaque is imaginary.',fx:'plaque'}
  };
  function load(){try{return JSON.parse(localStorage.getItem(K)||'[]')}catch(e){return[]}}
  function save(a){try{localStorage.setItem(K,JSON.stringify(a))}catch(e){}}
  function toast(t){var d=document.createElement('div');d.className='ddtoast';d.setAttribute('role','status');d.textContent=t;document.body.appendChild(d);setTimeout(function(){d.remove()},5200);}
  function fly(sym,cls){if(still)return;var d=document.createElement('div');d.className='ddfly '+cls;d.textContent=sym;d.setAttribute('aria-hidden','true');document.body.appendChild(d);setTimeout(function(){d.remove()},5200);}
  function found(w){
    var s=SECRETS[w],all=load(),first=all.indexOf(w)<0;if(first){all.push(w);save(all);}
    toast('🥚 Secret '+(first?'found':'again')+': '+w+'. '+s.say+' ('+all.length+' of 5)');
    if(s.fx==='cart')fly('🛒','fly-x');else if(s.fx==='ghost')fly('👻','fly-y');else if(s.fx==='sign')fly('⚠️','drop');else if(s.fx==='mops')fly('🧹🧹🧹','fly-x');else fly('🏆','drop');
  }
  window.DDSecrets={count:function(){return load().length},total:5};
  document.addEventListener('keydown',function(e){
    var t=e.target;if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    var k=e.key;
    kbuf.push(k.length===1?k.toLowerCase():k);if(kbuf.length>10)kbuf.shift();
    if(kbuf.join(',')===KONAMI){kbuf=[];found('KONAMI');return;}
    if(k.length===1&&/[a-z]/i.test(k)){buf=(buf+k.toUpperCase()).slice(-10);for(var w in SECRETS){if(w!=='KONAMI'&&buf.slice(-w.length)===w){buf='';found(w);break;}}}
  });
})();
