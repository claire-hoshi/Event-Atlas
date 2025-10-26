// Basic navigation bindings (works on all pages)
function hrefFor(key){
  const hosted = /\.web\.app$/.test(location.hostname) || /\.firebaseapp\.com$/.test(location.hostname);
  if (hosted) {
    return key === 'home' ? '/' : key === 'create' ? '/create-event' : key === 'drafts' ? '/drafts' : key === 'profile' ? '/#profile' : key === 'notifications' ? '/#notifications' : key === 'saved' ? '/#saved' : '/';
  } else {
    return key === 'home' ? 'index.html' : key === 'create' ? 'create-event.html' : key === 'drafts' ? 'drafts.html' : key === 'profile' ? 'index.html#profile' : key === 'notifications' ? 'index.html#notifications' : key === 'saved' ? 'index.html#saved' : 'index.html';
  }
}

function bindNav(id, key){
  const el = document.getElementById(id);
  if (el && !el._bound) { el._bound = true; el.addEventListener('click', () => { window.location.href = hrefFor(key); }); }
}

bindNav('rail-home-btn', 'home');
bindNav('rail-notify-btn', 'notifications');
bindNav('rail-saved-btn', 'saved');
bindNav('rail-create-btn', 'create');
bindNav('rail-drafts-btn', 'drafts');
bindNav('rail-profile-btn', 'profile');
