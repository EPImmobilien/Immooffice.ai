  // Fallback auf Microsoft CDN, falls jsDelivr blockiert ist
  if (typeof msal === 'undefined') {
    var _fb = document.createElement('script');
    _fb.src = 'https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js';
    document.head.appendChild(_fb);
  }
