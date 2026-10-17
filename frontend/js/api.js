const API_BASE = '/api';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function getCurrentUser() {
  try {
    const storedUser = localStorage.getItem('qmarketplace-user') || sessionStorage.getItem('qmarketplace-user');
    return JSON.parse(storedUser || 'null');
  } catch {
    localStorage.removeItem('qmarketplace-user');
    return null;
  }
}

function clearSession() {
  localStorage.removeItem('qmarketplace-token');
  localStorage.removeItem('qmarketplace-user');
  sessionStorage.removeItem('qmarketplace-token');
  sessionStorage.removeItem('qmarketplace-user');
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = localStorage.getItem('qmarketplace-token') || sessionStorage.getItem('qmarketplace-token');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error('Could not reach QMarketplace. Check your connection and try again.');
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};
  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new Error(data.message || `Request failed (${response.status}).`);
  }
  return data;
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

window.qmarketplaceApi = { apiRequest, clearSession, escapeHtml, getCurrentUser, showToast };
