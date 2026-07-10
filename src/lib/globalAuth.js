import { supabase } from "./supabaseClient";

// Seller logs in with just a username + password (no company name needed) —
// the backend looks up which company that username belongs to.
export async function sellerLoginGlobal(username, password) {
  const { data, error } = await supabase.rpc("seller_login", {
    p_username: username,
    p_password: password,
  });
  if (error || !data || !data[0] || !data[0].token) return null;
  return data[0]; // { token, company_slug, company_name }
}

// Member (buyer) logs in with ONLY email + password — the backend finds
// which company the email belongs to automatically.
export async function memberLoginGlobal(email, password) {
  const { data, error } = await supabase.rpc("member_login_v2", {
    p_email: email,
    p_password: password,
  });
  if (error || !data || !data[0] || !data[0].token) return null;
  return data[0]; // { token, member_id, member_number, member_name, company_slug, company_name }
}
