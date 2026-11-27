// Meta Pixel setup for the website (ad measurement for Facebook / Instagram campaigns).
//
// In its own file, like gtag-init.js, because the Content-Security-Policy in
// deploy/nginx/snippets/csp-public.conf blocks inline <script> blocks. Meta's own snippet is
// inline, so pasted as-is into index.html it would never run on the live site.
//
// It runs only on the live site, so local dev servers and test walks stay out of the ad numbers.
// Meta's <noscript> image fallback is left out on purpose: the app needs JavaScript to show
// anything, and that image would fire from every host, local ones included.
//
// Page views after the first are counted by the pixel itself: fbevents.js listens for the
// router's history changes (pushState), so no per-route call is needed in the app.
(function () {
  var host = window.location.hostname;
  if (host !== 'aanganerp.in' && host !== 'www.aanganerp.in') return;
  if (window.fbq) return;
  var n = (window.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  });
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  window.fbq('init', '1453929830225082');
  window.fbq('track', 'PageView');
  var tag = document.createElement('script');
  tag.async = true;
  tag.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(tag);
})();
