-- =========================================================================
-- reset_and_seed_demo.sql
-- =========================================================================
-- Run this in Supabase Dashboard → SQL Editor → New query → paste → Run.
--
-- WARNING: This DELETES every company, member, product, order, wallet,
-- ticket, and login you currently have. Everything cascades from the
-- `companies` table (see schema.sql), so one delete wipes it all.
--
-- After wiping, it creates 5 fresh companies, each with:
--   - a seller login (username + password)
--   - a company_code (shown in the member signup dropdown)
--   - 20 members, each with their own login + a starting wallet balance
--
-- All seller passwords: seller123
-- All member passwords:  member123
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1) WIPE — delete every company (cascades to members, products, orders,
--    wallets, attendance, tickets, checkins, khata entries, etc).
-- ---------------------------------------------------------------------
delete from companies;

-- Also clear pending OTPs so old codes can't linger.
delete from signup_otps;
delete from password_reset_otps;

-- ---------------------------------------------------------------------
-- 2) SEED — 5 companies, 20 members each.
-- ---------------------------------------------------------------------
do $$
declare
  v_company_id uuid;
  v_company record;
  v_companies text[][] := array[
    array['techcorp',   'TechCorp Solutions',    '💻', 'seller@techcorp.com',   'TECH0001'],
    array['greenfield', 'Greenfield Industries', '🌿', 'seller@greenfield.com', 'GREEN002'],
    array['blueocean',  'Blue Ocean Logistics',  '🚢', 'seller@blueocean.com',  'BLUE0003'],
    array['summit',     'Summit Enterprises',    '🏔️', 'seller@summit.com',     'SUMMIT04'],
    array['nova',       'Nova Systems',          '🚀', 'seller@nova.com',       'NOVA0005']
  ];
  v_row text[];
  i int;
  v_member_id uuid;
  v_signup_bonus numeric := 250;
begin
  foreach v_row slice 1 in array v_companies
  loop
    insert into companies (slug, name, emoji, admin_password_hash, seller_username, company_code)
    values (
      v_row[1], v_row[2], v_row[3],
      crypt('seller123', gen_salt('bf')),
      v_row[4],
      v_row[5]
    )
    returning id into v_company_id;

    for i in 1..20 loop
      insert into members (
        company_id, member_number, name, username, email, password_hash,
        daily_amount, active, wallet_balance
      )
      values (
        v_company_id,
        i,
        'Member ' || i,
        'member' || i || '@' || v_row[1] || '.demo',
        'member' || i || '@' || v_row[1] || '.demo',
        crypt('member123', gen_salt('bf')),
        250,
        true,
        v_signup_bonus
      )
      returning id into v_member_id;

      insert into member_wallet_transactions (company_id, member_id, amount, type, note)
      values (v_company_id, v_member_id, v_signup_bonus, 'signup_bonus', 'Welcome bonus on joining ' || v_row[2]);
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3) Sanity check — see what got created.
-- ---------------------------------------------------------------------
select c.name, c.slug, c.company_code, c.seller_username, count(m.id) as member_count
from companies c
left join members m on m.company_id = c.id
group by c.id
order by c.name;
