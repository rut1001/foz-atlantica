/* ============================================================
   notify-lead
   ------------------------------------------------------------
   Emails a notification when a row lands in public.enquiries.

   Driven by a database trigger rather than by the website. That
   matters twice over: the email fires on the row actually being
   written, so a notification can never announce a lead that was
   not stored, and there is no endpoint the website can be made
   to call to flood the inbox.

   verify_jwt is off, because the caller is Postgres and this
   project's service role key is not available to put in a
   trigger definition. The function authenticates instead on a
   32-byte shared secret that was generated inside the database
   and exists nowhere outside Vault. The URL being public is
   therefore uninteresting: without that header every request is
   refused before any work is done.

   Neither the Resend key nor the recipient address appears in
   this file. The key is a credential; the address is personal
   data and this source is kept in a public repository. Both are
   read from Vault at run time through public.get_secret, which
   only service_role may execute.

   Deployed with:
     supabase functions deploy notify-lead --no-verify-jwt
   ============================================================ */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/* Without a verified domain Resend permits exactly one sender and will only
   deliver to the account owner's own address. Both facts are load-bearing
   here; see the README before changing either. */
const FROM = "Foz Atlantica <onboarding@resend.dev>";

async function secret(name: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_secret`, {
    method: "POST",
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_name: name }),
  });
  if (!r.ok) throw new Error(`secret ${name}: HTTP ${r.status} ${await r.text()}`);
  const v = await r.json();
  if (!v) throw new Error(`secret ${name} is empty`);
  return v as string;
}

/* Constant-time compare, so a caller cannot learn the secret one byte at a
   time from how long the rejection takes. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Every field below was typed by a stranger on the open internet and is being
   dropped into an HTML email. Escaped, always. */
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function row(label: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return `<tr>
    <td style="padding:10px 16px 10px 0;color:#8a8275;font:500 11px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;letter-spacing:1.4px;text-transform:uppercase;vertical-align:top;white-space:nowrap">${esc(label)}</td>
    <td style="padding:10px 0;color:#1c1813;font:400 15px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif">${esc(value).replace(/\n/g, "<br>")}</td>
  </tr>`;
}

Deno.serve(async (req: Request) => {
  try {
    const expected = await secret("NOTIFY_WEBHOOK_SECRET");
    const offered  = req.headers.get("x-notify-secret") ?? "";
    if (!sameSecret(offered, expected)) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    /* Shape sent by a Supabase database webhook. Accept a bare row too, so
       the function can be exercised by hand without a trigger. */
    const e = body?.record ?? body;

    if (!e || !e.email) {
      return new Response(JSON.stringify({ error: "no enquiry in payload" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    const [key, to] = await Promise.all([secret("RESEND_API_KEY"), secret("LEAD_NOTIFY_TO")]);

    const when = new Date(e.created_at ?? Date.now()).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon",
    });

    const html = `<!doctype html><html><body style="margin:0;background:#f6f3ee;padding:28px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4ddd2;border-radius:3px">
  <tr><td style="padding:26px 28px 18px;border-bottom:1px solid #efe9df">
    <div style="color:#9e7c45;font:500 10px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;letter-spacing:2.4px;text-transform:uppercase">New enquiry</div>
    <div style="margin-top:8px;color:#1c1813;font:400 24px/1.25 Georgia,'Times New Roman',serif">${esc(e.name)}</div>
  </td></tr>
  <tr><td style="padding:8px 28px 22px">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
      ${row("Email", e.email)}
      ${row("Phone", e.phone)}
      ${row("Wants", e.intent)}
      ${row("Budget", e.budget)}
      ${row("Message", e.message)}
      ${row("Received", when + " (Lisbon)")}
      ${row("From page", e.page_path)}
    </table>
  </td></tr>
  <tr><td style="padding:16px 28px 24px;border-top:1px solid #efe9df;color:#8a8275;font:400 12px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif">
    Reply to this email to answer ${esc(e.name)} directly.<br>
    Foz Atlântica is a demonstration project; this enquiry is real but the development is not.
  </td></tr>
</table></body></html>`;

    const text = [
      `New enquiry — ${e.name}`, "",
      `Email:    ${e.email}`,
      e.phone   ? `Phone:    ${e.phone}`   : "",
      e.intent  ? `Wants:    ${e.intent}`  : "",
      e.budget  ? `Budget:   ${e.budget}`  : "",
      e.message ? `\nMessage:\n${e.message}` : "",
      ``, `Received: ${when} (Lisbon)`,
      e.page_path ? `Page:     ${e.page_path}` : "",
    ].filter(Boolean).join("\n");

    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        /* So a reply goes straight to the lead rather than to Resend. */
        reply_to: e.email,
        subject: `New enquiry — ${e.name}`,
        html, text,
        ...(e.id ? { headers: { "X-Entity-Ref-ID": String(e.id) } } : {}),
      }),
    });

    const result = await send.json().catch(() => ({}));
    if (!send.ok) {
      console.error("resend rejected the send", send.status, JSON.stringify(result));
      return new Response(JSON.stringify({ ok: false, status: send.status, result }), {
        status: 502, headers: { "Content-Type": "application/json" },
      });
    }

    console.log("notified for enquiry", e.id, "->", result.id);
    return new Response(JSON.stringify({ ok: true, id: result.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-lead failed", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
