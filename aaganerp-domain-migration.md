# aaganerp.in production-domain migration

## Goal

Make `aaganerp.in` and `www.aaganerp.in` the documented production domain for the existing `prod` stack while retaining DuckDNS as staging.

## Tasks

- [x] Locate production-domain references and the live-stack boundary → the `prod` stack remains the sole live deployment.
- [x] Add a host-Nginx template for `aaganerp.in` on the existing port 8092 → template proxies only to loopback.
- [x] Update production configuration and workflow labels → the template accepts both canonical hostnames.
- [ ] Apply the VPS migration and validate the live TLS path → requires DNS and VPS access.

## Done When

- [ ] A VPS operator can point DNS, install the Nginx site, issue TLS, update the prod `.env`, and deploy without touching the staging stack.

## VPS steps

1. Point `aaganerp.in` and `www.aaganerp.in` to the VPS public IP, then confirm both resolve there.
2. On `/var/www/1darjeeling-in`, set `CORS_ORIGINS=https://aaganerp.in,https://www.aaganerp.in` and `MINIO_PUBLIC_URL=https://aaganerp.in` in the existing `.env`.
3. Install `deploy/host-nginx-site.aaganerp.in.conf.example` as the new host-Nginx site, test it, then issue the certificate for both hostnames.
4. Deploy the `prod` branch. Verify `https://aaganerp.in/api/health`, Google OAuth, Razorpay webhooks, and image uploads.
5. After verification, change the old `1darjeeling.in` VPS site to a permanent redirect to `https://aaganerp.in$request_uri`; retain its certificate until the redirect is confirmed.
