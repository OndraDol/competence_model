(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const lastUpdated = document.getElementById('last-updated');
    if (lastUpdated) {
      lastUpdated.textContent = 'Dashboard zatím není napojený na Firebase.';
    }
  });
})();
