-- ============================================================
-- Lead notification wiring
-- ------------------------------------------------------------
-- The database pieces that make a new enquiry send an email.
-- Applied already; kept here so the moving parts are readable
-- without opening the Supabase dashboard, and so they can be
-- rebuilt if the project is ever recreated.
--
-- Nothing secret is in this file. Three values live in Vault:
--   RESEND_API_KEY         sending-access key, created in Resend
--   LEAD_NOTIFY_TO         where notifications are delivered
--   NOTIFY_WEBHOOK_SECRET  32 random bytes, generated below
-- ============================================================

create extension if not exists pg_net with schema extensions;

-- ── Secrets ────────────────────────────────────────────────
-- Run once, with real values. Vault encrypts at rest; the plain
-- text is only visible through vault.decrypted_secrets, which
-- ordinary roles cannot select from.
--
--   select vault.create_secret('re_...',            'RESEND_API_KEY',        'Resend sending key');
--   select vault.create_secret('you@example.com',   'LEAD_NOTIFY_TO',        'Notification recipient');
--   select vault.create_secret(
--     encode(extensions.gen_random_bytes(32), 'hex'),
--     'NOTIFY_WEBHOOK_SECRET',
--     'Shared secret proving a notify-lead call came from the trigger');


-- ── The only door into Vault ───────────────────────────────
-- PostgREST does not expose the vault schema, so the Edge
-- Function cannot read it directly. This is deliberately narrow:
-- SECURITY DEFINER to see the vault, an empty search_path so
-- nothing can be shadowed into it, and EXECUTE revoked from
-- everyone except service_role. anon and authenticated — the two
-- roles a browser can hold — cannot call it at all.
create or replace function public.get_secret(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text;
begin
  select decrypted_secret into v
    from vault.decrypted_secrets
   where name = p_name;
  return v;
end;
$$;

revoke all on function public.get_secret(text) from public;
revoke all on function public.get_secret(text) from anon;
revoke all on function public.get_secret(text) from authenticated;
grant execute on function public.get_secret(text) to service_role;

comment on function public.get_secret(text) is
  'Reads a Vault secret. service_role only — never expose to anon or authenticated.';


-- ── The trigger ────────────────────────────────────────────
create or replace function public.notify_new_enquiry()
returns trigger
language plpgsql
security definer           -- needs to read the shared secret out of Vault
set search_path = ''
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'NOTIFY_WEBHOOK_SECRET';

  if v_secret is null then
    raise warning 'notify_new_enquiry: NOTIFY_WEBHOOK_SECRET missing, enquiry % stored but not announced', new.id;
    return new;
  end if;

  -- pg_net registers against the `extensions` schema but creates its own
  -- `net` schema for the callable functions, so `extensions.net.http_post`
  -- does not exist. With an empty search_path the name has to be spelled out.
  perform net.http_post(
    url     := 'https://iwqbszwucnhsfccfuzyr.supabase.co/functions/v1/notify-lead',
    body    := jsonb_build_object(
                 'type',   'INSERT',
                 'table',  'enquiries',
                 'record', to_jsonb(new)
               ),
    headers := jsonb_build_object(
                 'Content-Type',    'application/json',
                 'x-notify-secret', v_secret
               ),
    timeout_milliseconds := 5000
  );

  return new;

exception when others then
  /* The lead is the thing that matters. pg_net queues rather than blocks, so
     this should not fire, but if anything here raised and were allowed to
     propagate it would roll back the INSERT and the enquiry would be lost to
     spare an email. Warn and keep the row. */
  raise warning 'notify_new_enquiry: could not queue notification for % (%)', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function public.notify_new_enquiry() from public, anon, authenticated;

drop trigger if exists enquiries_notify on public.enquiries;

create trigger enquiries_notify
  after insert on public.enquiries
  for each row
  execute function public.notify_new_enquiry();

comment on trigger enquiries_notify on public.enquiries is
  'Fires notify-lead so a new enquiry is emailed. After-insert and non-blocking: a failure here never costs the row.';


-- ── Checking on it ─────────────────────────────────────────
-- pg_net is asynchronous: the trigger queues and returns, and a
-- worker makes the call a moment later. To see what came back:
--
--   select status_code, left(content, 200), error_msg, created
--     from net._http_response order by created desc limit 5;
--
-- 200 with {"ok":true,...} means Resend accepted it. 403 means the
-- shared secret does not match. An empty table right after an insert
-- usually means the request was never queued — check the Postgres
-- logs for the warning raised above.
