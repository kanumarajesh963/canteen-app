-- =========================================================================
-- cleanup_demo_data.sql
-- =========================================================================
-- Run this ONCE, in Supabase Dashboard → SQL Editor, after real data has
-- started coming in and you no longer want the built-in demo account.
--
-- It deletes ONLY the demo company (slug = 'demo'). Everything owned by that
-- company — the "Rajesh Admin" member, its orders, wallets, attendance,
-- tickets, khata entries, sessions, etc. — is removed automatically, because
-- every one of those tables references companies(id) ON DELETE CASCADE.
--
-- Your real companies and their data are NOT touched.
--
-- After running this, the "try the demo" button on the login screen will
-- stop working (there's no demo account left) — which is exactly what you
-- want in production. To bring the demo back, just re-run schema.sql.
-- =========================================================================

begin;

-- 1) The demo company + everything that cascades from it.
delete from companies where slug = 'demo';

-- 2) Any leftover demo OTPs (these don't cascade from companies).
delete from signup_otps          where lower(email) like '%@demo.com';
delete from password_reset_otps  where lower(email) like '%@demo.com';

-- 3) Confirm nothing demo-ish remains (should all return 0 rows).
select 'companies' as table, count(*) from companies where slug = 'demo'
union all
select 'demo members', count(*) from members
  where lower(email) like '%@demo.com' or lower(username) like '%@demo.com';

commit;
