// Google Analytics (GA4) setup for the website.
//
// In its own file, like error-shim.js, because the Content-Security-Policy in
// deploy/nginx/snippets/csp-public.conf blocks inline <script> blocks. As an inline script this
// setup never ran on the live site, so no visits were counted.
//
// It runs only on the live site. Local dev servers and test walks have no security policy, so
// they used to send their visits to the real property and fill it with test traffic.
(function () {
  var host = window.location.hostname;
  if (host !== 'aanganerp.in' && host !== 'www.aanganerp.in') return;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', 'G-F0L875ND2V');
  var tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://www.googletagmanager.com/gtag/js?id=G-F0L875ND2V';
  document.head.appendChild(tag);
})();
