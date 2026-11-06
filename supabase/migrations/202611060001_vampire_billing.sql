-- Vampire Client billing schema (Supabase/PostgreSQL)
-- Run in a private Supabase project. Never expose service_role credentials to the launcher.
create extension if not exists pgcrypto;

create table if not exists public.vampire_products (
  product_key text primary key check (product_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  price_paise bigint not null check (price_paise between 100 and 10000000),
  entitlement_key text not null check (entitlement_key ~ '^[a-z0-9][a-z0-9_.:-]{1,95}$'),
  active boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.vampire_payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  product_key text not null references public.vampire_products(product_key) on delete restrict,
  provider text not null default 'famgateway' check (provider = 'famgateway'),
  provider_order_id text not null unique,
  amount_paise bigint not null check (amount_paise between 100 and 10000000),
  payable_amount_paise bigint not null check (payable_amount_paise between amount_paise and amount_paise + 100),
  status text not null default 'pending' check (status in ('pending','paid','expired','failed')),
  utr text unique,
  provider_transaction_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint vampire_paid_fields_consistent check (
    (status = 'paid' and utr is not null and paid_at is not null)
    or status <> 'paid'
  )
);
create index if not exists vampire_payment_orders_user_created_idx
  on public.vampire_payment_orders(user_id, created_at desc);

create table if not exists public.vampire_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_key text not null,
  source_order_id uuid not null unique references public.vampire_payment_orders(id) on delete restrict,
  granted_at timestamptz not null default now(),
  primary key(user_id, entitlement_key)
);

create table if not exists public.vampire_billing_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  action text not null,
  target text not null,
  created_at timestamptz not null default now()
);

alter table public.vampire_products enable row level security;
alter table public.vampire_payment_orders enable row level security;
alter table public.vampire_entitlements enable row level security;
alter table public.vampire_billing_audit enable row level security;
-- No direct client policies. All access is mediated by the private backend service role.

create or replace function public.vampire_complete_payment(
  p_provider_order_id text,
  p_amount_paise bigint,
  p_payable_amount_paise bigint,
  p_utr text,
  p_transaction_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.vampire_payment_orders%rowtype;
  v_entitlement text;
begin
  select * into v_order
  from public.vampire_payment_orders
  where provider_order_id = p_provider_order_id
  for update;

  if not found then raise exception 'order_not_found'; end if;
  if v_order.status = 'paid' then
    if v_order.utr = p_utr then return jsonb_build_object('status','already_paid'); end if;
    raise exception 'order_already_fulfilled';
  end if;
  if v_order.status <> 'pending' then raise exception 'order_not_pending'; end if;
  if v_order.amount_paise <> p_amount_paise or v_order.payable_amount_paise <> p_payable_amount_paise then
    raise exception 'amount_mismatch';
  end if;
  if p_utr !~ '^[0-9]{12}$' then raise exception 'invalid_utr'; end if;

  update public.vampire_payment_orders
  set status = 'paid', utr = p_utr, provider_transaction_id = nullif(p_transaction_id,''),
      paid_at = now()
  where id = v_order.id;

  select entitlement_key into v_entitlement
  from public.vampire_products where product_key = v_order.product_key;

  if v_entitlement is null then raise exception 'product_missing'; end if;

  insert into public.vampire_entitlements(user_id, entitlement_key, source_order_id)
  values(v_order.user_id, v_entitlement, v_order.id)
  on conflict (user_id, entitlement_key) do nothing;

  insert into public.vampire_billing_audit(actor_user_id, action, target)
  values(null, 'payment.fulfilled', p_provider_order_id);

  return jsonb_build_object('status','paid');
end;
$$;

revoke all on function public.vampire_complete_payment(text,bigint,bigint,text,text) from public, anon, authenticated;
grant execute on function public.vampire_complete_payment(text,bigint,bigint,text,text) to service_role;
