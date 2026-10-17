document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-download-material]');
  if (!button) return;
  event.preventDefault();
  const message = button.parentElement.querySelector('[data-download-message]');
  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Preparing download...';
  if (message) message.textContent = '';
  try {
    const result = await window.qmarketplaceApi.apiRequest(
      `/users/materials/${encodeURIComponent(button.dataset.downloadMaterial)}/download`
    );
    const url = new URL(result.url);
    if (url.protocol !== 'https:') throw new Error('The download service returned an unsafe address.');
    window.location.assign(url.href);
  } catch (error) {
    if (message) message.textContent = error.message;
    else window.qmarketplaceApi.showToast(error.message);
    button.disabled = false;
    button.textContent = label;
  }
});