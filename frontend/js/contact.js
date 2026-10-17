document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;
  const message = form.querySelector('[data-contact-message]');
  const submit = form.querySelector('[type="submit"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    message.textContent = 'Sending message...';
    try {
      const response = await window.qmarketplaceApi.apiRequest('/contact', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      message.textContent = response.message;
      form.reset();
    } catch (error) {
      message.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
});
