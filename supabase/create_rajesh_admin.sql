-- =========================================================================
-- create_rajesh_admin.sql  —  quick fix if the "Rajesh Admin" demo login
-- says "Demo accounts aren't set up yet".
-- =========================================================================
-- Run this in Supabase → SQL Editor. It:
--   1) makes sure a 'demo' company exists (creates it if missing),
--   2) creates OR repairs the Rajesh Admin account as a full-access admin.
--
-- Requires that schema.sql has already been run at least once (so the
-- members.role column and the 'fullaccess' role option exist). If this
-- errors about a missing "role" column, run the latest schema.sql first.
--
--   Login afterwards:  rajesh@demo.com  /  demo123
-- =========================================================================
do $$
declare
  v_cid uuid;
begin
  select id into v_cid from companies where slug = 'demo';
  if v_cid is null then
    insert into companies (slug, name, emoji, admin_password_hash, seller_username, company_code)
    values ('demo', 'Demo Canteen', '🍱', crypt('demo123', gen_salt('bf')),
            'seller@demo.com', 'DEMO99')
    returning id into v_cid;
  end if;

  insert into members (company_id, member_number, name, username, email,
                       password_hash, daily_amount, active, role, wallet_balance)
  values (v_cid, 9001, 'Rajesh Admin', 'rajesh@demo.com', 'rajesh@demo.com',
          crypt('demo123', gen_salt('bf')), 250, true, 'fullaccess', 250)
  on conflict (company_id, username) do update
    set password_hash = excluded.password_hash,
        role          = 'fullaccess',
        active         = true,
        email          = excluded.email,
        name           = excluded.name;
end $$;

-- Confirm — should return exactly one row, role = fullaccess, active = t.
select member_number, name, username, role, active
from members where username = 'rajesh@demo.com';
