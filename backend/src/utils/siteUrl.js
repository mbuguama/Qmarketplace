function parseOrigin(value, variableName) {
  const candidate = value.includes('://') ? value : `https://${value}`;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${variableName} must be an HTTP(S) origin without credentials.`);
  }
  return url.origin;
}

function isLoopbackOrigin(origin) {
  const hostname = new URL(origin).hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function getPublicSiteOrigins() {
  const isVercel = Boolean(process.env.VERCEL);
  const configuredOrigins = [
    ['FRONTEND_URL', process.env.FRONTEND_URL],
    ['VERCEL_PROJECT_PRODUCTION_URL', process.env.VERCEL_PROJECT_PRODUCTION_URL],
    ['VERCEL_URL', process.env.VERCEL_URL]
  ].filter(([, value]) => value).map(([name, value]) => parseOrigin(value, name));
  const origins = isVercel
    ? configuredOrigins.filter((origin) => !isLoopbackOrigin(origin))
    : configuredOrigins;
  return [...new Set(origins)];
}

function getPublicSiteOrigin() {
  const origins = getPublicSiteOrigins();
  const configuredOrigin = process.env.FRONTEND_URL
    ? parseOrigin(process.env.FRONTEND_URL, 'FRONTEND_URL')
    : null;
  const isVercel = Boolean(process.env.VERCEL);
  if (configuredOrigin && (!isVercel || !isLoopbackOrigin(configuredOrigin))) return configuredOrigin;

  const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (productionDomain) return parseOrigin(productionDomain, 'VERCEL_PROJECT_PRODUCTION_URL');
  if (process.env.VERCEL_URL) return parseOrigin(process.env.VERCEL_URL, 'VERCEL_URL');
  if (isVercel) throw new Error('Vercel did not provide a production URL; configure FRONTEND_URL.');
  return origins[0] || null;
}

module.exports = { getPublicSiteOrigin, getPublicSiteOrigins };
