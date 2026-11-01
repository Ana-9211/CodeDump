/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
// XSS defence in depth (VFR-06): only our own scripts run. Next.js needs inline bootstrap scripts, so 'unsafe-inline'
// stays for script/style; remote cover images are allowed (https only), everything else must come from this origin.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig = {
  // native/Node-only drivers must not be bundled by webpack
  serverExternalPackages: ['pg', 'mongodb', 'bcryptjs', 'jsonwebtoken'],
  poweredByHeader: false,
  devIndicators: false, // the floating dev-mode badge is not part of the app and shows up in screenshots
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        // VFR-05: once served over HTTPS, browsers must keep using it
        ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    }];
  },
};
export default nextConfig;
