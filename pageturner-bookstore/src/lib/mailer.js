// E-mail adapter (FR-14). There is no SMTP server in this project, so the "transport" prints the
// message on the server console - the same test-adapter idea the SE team used for the payment/e-mail
// providers. Swapping in a real provider means replacing deliver() and nothing else.
import { asApp } from './db.js';

export async function deliver({ to, name, subject, text }) {
  console.log(`[mail] To: ${name ? `${name} <${to}>` : to}\n[mail] Subject: ${subject}\n[mail] ${text}`);
}

export const sendMail = (msg) => deliver(msg);

let flushing = null;
/**
 * Sends everything the database triggers queued (order confirmed, shipped, review, ...).
 * Called after each state-changing request, so the customer's e-mail leaves within seconds (FR-14: 60 s).
 */
export function flushOutbox() {
  flushing ??= (async () => {
    try {
      const rows = await asApp('SELECT * FROM fn_pending_emails(20)');
      for (const m of rows) {
        try {
          await deliver({ to: m.to_email, name: m.to_name, subject: m.subject, text: m.body });
          await asApp('SELECT fn_mark_email($1::bigint, $2)', [m.notification_id, 'sent']);
        } catch {
          await asApp('SELECT fn_mark_email($1::bigint, $2)', [m.notification_id, 'failed']).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[mail] outbox flush failed:', e.message);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
