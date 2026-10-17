document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-search-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = String(new FormData(form).get('q') || '').trim();
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      const search = params.toString();
      window.location.assign(`/materials.html${search ? `?${search}` : ''}`);
    });
  });
});