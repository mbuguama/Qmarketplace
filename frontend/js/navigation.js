document.addEventListener('DOMContentLoaded', () => {
  const user = window.qmarketplaceApi.getCurrentUser();
  const authLink = document.querySelector('[data-auth-link]');
  if (authLink) {
    authLink.textContent = user?.role === 'admin' ? 'Admin' : user ? 'Profile' : 'Login';
    authLink.setAttribute('href', user?.role === 'admin' ? '/admin/dashboard.html' : user ? '/profile.html' : '/login.html');
  }

  document.querySelectorAll('.topbar-inner').forEach((header) => {
    const nav = header.querySelector('.nav-links');
    if (!nav) return;
    const toggle = document.createElement('button');
    toggle.className = 'mobile-toggle';
    toggle.type = 'button';
    toggle.textContent = 'Menu';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Toggle navigation');
    nav.id ||= `main-navigation-${Math.random().toString(36).slice(2)}`;
    toggle.setAttribute('aria-controls', nav.id);
    nav.insertAdjacentElement('afterend', toggle);
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      nav.classList.toggle('is-open', !expanded);
    });

    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
    nav.querySelectorAll('a').forEach((link) => {
      const linkPath = new URL(link.href, window.location.href).pathname.replace(/\/$/, '') || '/';
      if (linkPath === currentPath) link.setAttribute('aria-current', 'page');
    });
  });

  document.querySelectorAll('[data-logout]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      window.qmarketplaceApi.clearSession();
      window.location.href = '/';
    });
  });
});
