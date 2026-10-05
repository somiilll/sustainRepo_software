const safelySerialize = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

export const buildPcfWorkspaceDocument = (source, context) => {
  const bridge = `<script>
window.__SUSTAINREPO_PCF_CONTEXT__ = ${safelySerialize(context)};
(() => {
  const originalFetch = window.fetch.bind(window);
  let context = window.__SUSTAINREPO_PCF_CONTEXT__;
  window.fetch = (input, init = {}) => {
    if (typeof input !== 'string' || !input.startsWith('/api/')) return originalFetch(input, init);
    const headers = new Headers(init.headers || {});
    const token = window.localStorage.getItem('token');
    if (token) headers.set('Authorization', 'Bearer ' + token);
    if (context?.facility?.id) headers.set('X-PCF-Facility-ID', context.facility.id);
    return originalFetch('/api/pcf' + input.slice(4), { ...init, headers, credentials: 'same-origin' });
  };
  const applyContext = () => {
    const country = context?.facility?.country || context?.organization?.country;
    const countryField = document.getElementById('prodCountry');
    if (country && countryField) countryField.value = country;
  };
  document.addEventListener('DOMContentLoaded', applyContext, { once: true });
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.data?.type !== 'sustainrepo-pcf-context') return;
    context = event.data.context;
    window.__SUSTAINREPO_PCF_CONTEXT__ = context;
    applyContext();
  });
})();
</script>`;
  return source.replace(/<\/head>/i, `${bridge}</head>`);
};