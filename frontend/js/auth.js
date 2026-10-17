document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('[data-auth-form]');
  if (!form) return;

  const submit = form.querySelector('[type="submit"]');
  const message = form.querySelector('[data-form-message]');
  const password = form.querySelector('input[type="password"]');
  if (password) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'password-toggle';
    toggle.textContent = 'Show';
    toggle.setAttribute('aria-label', 'Show password');
    password.insertAdjacentElement('afterend', toggle);
    toggle.addEventListener('click', () => {
      const reveal = password.type === 'password';
      password.type = reveal ? 'text' : 'password';
      toggle.textContent = reveal ? 'Hide' : 'Show';
      toggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (message) message.textContent = '';
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    const originalLabel = submit.textContent;
    submit.textContent = form.dataset.authMode === 'register' ? 'Creating account...' : 'Signing in...';
    const payload = Object.fromEntries(new FormData(form).entries());
    delete payload.remember;

    try {
      const endpoint = form.dataset.authMode === 'register' ? '/auth/register' : '/auth/login';
      const response = await window.qmarketplaceApi.apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const remember = form.elements.remember?.checked;
      window.qmarketplaceApi.clearSession();
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem('qmarketplace-token', response.token);
      storage.setItem('qmarketplace-user', JSON.stringify(response.user));
      const next = new URLSearchParams(window.location.search).get('next');
      let safeNext = '/';
      if (next) {
        try {
          const destination = new URL(next, window.location.origin);
          const decodedPath = decodeURIComponent(destination.pathname);
          if (destination.origin === window.location.origin && !decodedPath.includes('\\')) {
            safeNext = `${destination.pathname}${destination.search}${destination.hash}`;
          }
        } catch (error) {
          if (!(error instanceof TypeError) && !(error instanceof URIError)) throw error;
        }
      }
      window.location.href = response.user.role === 'admin' ? '/admin/dashboard.html' : safeNext;
    } catch (error) {
      if (message) message.textContent = error.message || 'Please try again.';
      else window.qmarketplaceApi.showToast(error.message || 'Please try again.');
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
      submit.textContent = originalLabel;
    }
  });
});
