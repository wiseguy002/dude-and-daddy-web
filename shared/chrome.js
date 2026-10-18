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
