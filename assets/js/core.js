(function (global) {
  'use strict';

  const Core = {
    firebaseUrl: null,

    configure(options) {
      Object.assign(this, options);
    },

    async fetchJson(path) {
      if (!this.firebaseUrl) {
        throw new Error('Core.firebaseUrl is not configured');
      }
      const url = `${this.firebaseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}.json`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status}`);
      }
      return response.json();
    },

    formatDate(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      return d.toLocaleString('cs-CZ');
    },
  };

  global.Core = Core;
})(window);
