// The studio news list: the sign-up form on the home page, and the Confirm / Unsubscribe buttons on their pages.
// Talks only to this site's own /api/ (see worker/index.mjs).
(function () {
  function post(path, body) {
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok && j.ok === true, error: j.error }; });
    }, function () { return { status: 0, ok: false, error: 'offline' }; });
  }
  var WHY = {
    'bad email': 'That does not look like an email address. Check it and try again.',
    'grown-ups only': 'Please tick the box: this list is for grown-ups.',
    'slow down': 'Too many tries. Wait a minute and try again.',
    'bad link': 'That link has run out or was already used. Sign up again from the home page.',
    offline: 'No connection right now. Try again in a moment.'
  };
  function why(r) { return WHY[r.error] || 'The mail room is closed right now. Please try again later.'; }

  var form = document.getElementById('newsform');
  if (form) {
    var say = document.getElementById('newssay'), btn = form.querySelector('button');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.elements.email.value, adult = form.elements.adult.checked;
      if (!adult) { say.textContent = WHY['grown-ups only']; return; }
      btn.disabled = true;
      say.textContent = 'Sending…';
      post('/api/subscribe', { email: email, adult: true, website: form.elements.website.value }).then(function (r) {
        btn.disabled = false;
        if (r.ok) { form.reset(); say.textContent = 'Check your inbox! Click the link in our email to finish. (No email? Look in the junk folder.)'; }
        else say.textContent = why(r);
      });
    });
  }

  var act = document.getElementById('newsact');
  if (act) {
    var out = document.getElementById('newssay'), token = location.hash.slice(1), kind = act.getAttribute('data-kind');
    if (!token) { act.style.display = 'none'; out.textContent = WHY['bad link']; }
    act.addEventListener('click', function () {
      act.disabled = true;
      post(kind === 'confirm' ? '/api/confirm' : '/api/unsubscribe', { token: token }).then(function (r) {
        if (r.ok) { act.style.display = 'none'; out.textContent = kind === 'confirm' ? "You're on the list. Mop included. A welcome email is on its way." : 'Done. You are off the list and we have removed your address.'; }
        else { act.disabled = false; out.textContent = why(r); }
      });
    });
  }
})();
