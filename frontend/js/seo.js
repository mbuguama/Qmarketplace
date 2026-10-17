(() => {
  const ensureMeta = (selector, attribute, value) => {
    let element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, value);
      document.head.append(element);
    }
    return element;
  };

  const setMeta = (name, content) => {
    const meta = ensureMeta(`meta[name="${name}"]`, 'name', name);
    meta.content = content;
  };

  const setProperty = (property, content) => {
    const meta = ensureMeta(`meta[property="${property}"]`, 'property', property);
    meta.content = content;
  };

  const setStructuredData = (data) => {
    let script = document.getElementById('qmarketplace-structured-data');
    if (!script) {
      script = document.createElement('script');
      script.id = 'qmarketplace-structured-data';
      script.type = 'application/ld+json';
      document.head.append(script);
    }
    script.textContent = JSON.stringify(data);
  };

  const absoluteUrl = (path) => new URL(path, window.location.origin).href;
  const currentCanonicalPath = () => {
    const url = new URL(window.location.href);
    const path = url.pathname.toLowerCase();
    const keepId = ['/material-details.html', '/course-details.html', '/university-details.html'].includes(path);
    url.search = '';
    url.hash = '';
    if (keepId) {
      const id = new URLSearchParams(window.location.search).get('id');
      if (id) url.searchParams.set('id', id);
    }
    return `${url.pathname}${url.search}`;
  };

  const update = ({ title, description, canonicalPath, image, structuredData, robots } = {}) => {
    if (title) document.title = title;
    if (description) setMeta('description', description);
    if (robots) setMeta('robots', robots);

    const canonicalUrl = absoluteUrl(canonicalPath || currentCanonicalPath());
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    canonical.href = canonicalUrl;

    setProperty('og:type', 'website');
    setProperty('og:site_name', 'QMarketplace');
    setProperty('og:title', title || document.title);
    setProperty('og:description', description || document.querySelector('meta[name="description"]')?.content || '');
    setProperty('og:url', canonicalUrl);
    setProperty('og:locale', 'en_US');
    if (image) setProperty('og:image', absoluteUrl(image));

    if (structuredData) setStructuredData(structuredData);
  };

  window.qmarketplaceSeo = { absoluteUrl, update };
  update();
})();
