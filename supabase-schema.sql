-- ============================================================
-- Cloud Kitchen OMS — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ── ENUM TYPES ──────────────────────────────────────────────
create type user_role   as enum ('admin','sales','kitchen','accounts');
create type order_status as enum ('DRAFT','CONFIRMED','IN_PRODUCTION','READY','BILLED','PAID','CANCELLED');
create type payment_status as enum ('unpaid','partial','paid');
create type payment_method as enum ('cash','upi','card','bank_transfer','other');

-- ── PROFILES (extends Supabase auth.users) ──────────────────
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       user_role not null default 'sales',
  email      text not null,
  commission_percent numeric(5,2),
  is_active  boolean not null default true,
  check (commission_percent is null or (commission_percent >= 0 and commission_percent <= 100)),
  created_at timestamptz not null default now()
);

-- Auto-create profile row whenever a new auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, email, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'User'),
    'sales',
    coalesce(new.email, ''),
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any existing auth users missing profiles
insert into public.profiles (id, name, role, email, is_active)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1), 'User') as name,
  'sales'::user_role as role,
  coalesce(u.email, '') as email,
  true as is_active
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ── CATEGORIES ──────────────────────────────────────────────
create table public.categories (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- ── PRODUCTS ────────────────────────────────────────────────
create table public.products (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  price       numeric(10,2) not null default 0,
  category_id uuid references public.categories(id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── RECIPES ─────────────────────────────────────────────────
create table public.recipes (
  id          uuid primary key default uuid_generate_v4(),
  product_id  uuid not null references public.products(id) on delete cascade,
  ingredients jsonb not null default '[]',
  steps       text not null default '',
  notes       text,
  created_at  timestamptz not null default now()
);

-- ── ORDERS ──────────────────────────────────────────────────
create table public.orders (
  id              uuid primary key default uuid_generate_v4(),
  order_number    serial unique,
  salesperson_id  uuid not null references public.profiles(id),
  customer_name   text not null,
  phone           text,
  address         text,
  notes           text,
  is_factory_order boolean not null default false,
  status          order_status not null default 'CONFIRMED',
  qr_code         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── ORDER ITEMS ─────────────────────────────────────────────
create table public.order_items (
  id          uuid primary key default uuid_generate_v4(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  uuid not null references public.products(id),
  quantity    integer not null default 1,
  price       numeric(10,2) not null default 0
);

-- ── INVOICES ────────────────────────────────────────────────
create table public.invoices (
  id          uuid primary key default uuid_generate_v4(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  subtotal    numeric(10,2) not null default 0,
  discount    numeric(10,2) not null default 0,
  vat         numeric(10,2) not null default 0,
  total       numeric(10,2) not null default 0,
  status      payment_status not null default 'unpaid',
  created_at  timestamptz not null default now()
);

-- ── PAYMENTS ────────────────────────────────────────────────
create table public.payments (
  id              uuid primary key default uuid_generate_v4(),
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  amount_paid     numeric(10,2) not null default 0,
  payment_method  payment_method not null default 'cash',
  status          payment_status not null default 'unpaid',
  created_at      timestamptz not null default now()
);

-- ── AUDIT LOGS ──────────────────────────────────────────────
create table public.audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.profiles(id),
  action      text not null,
  details     jsonb,
  created_at  timestamptz not null default now()
);

-- ── APP SETTINGS ───────────────────────────────────────────
create table public.app_settings (
  id                  integer primary key,
  commission_percent  numeric(5,2) not null default 5,
  updated_at          timestamptz not null default now(),
  check (id = 1),
  check (commission_percent >= 0 and commission_percent <= 100)
);

insert into public.app_settings (id, commission_percent)
values (1, 5)
on conflict (id) do nothing;

-- ── INDEXES ─────────────────────────────────────────────────
create index idx_orders_status on public.orders(status);
create index idx_orders_salesperson on public.orders(salesperson_id);
create index idx_order_items_order on public.order_items(order_id);
create index idx_invoices_order on public.invoices(order_id);
create index idx_audit_logs_user on public.audit_logs(user_id);

-- ── AUTO-SET qr_code = order id after insert ────────────────
create or replace function set_order_qr()
returns trigger as $$
begin
  new.qr_code := new.id::text;
  return new;
end;
$$ language plpgsql;

create trigger trg_set_order_qr
  before insert on public.orders
  for each row execute function set_order_qr();

-- ── AUTO-UPDATE updated_at ──────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_orders_updated
  before update on public.orders
  for each row execute function update_updated_at();

-- ── ROW LEVEL SECURITY ─────────────────────────────────────
alter table public.profiles    enable row level security;
alter table public.categories  enable row level security;
alter table public.products    enable row level security;
alter table public.recipes     enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.invoices    enable row level security;
alter table public.payments    enable row level security;
alter table public.audit_logs  enable row level security;
alter table public.app_settings enable row level security;

-- Helper: get current user role
create or replace function public.get_my_role()
returns user_role as $$
  select role from public.profiles where id = auth.uid();
$$ language sql security definer stable;

-- ── PROFILES policies ───────────────────────────────────────
create policy "Users can view own profile"
  on public.profiles for select using (id = auth.uid());
create policy "Admin can view all profiles"
  on public.profiles for select using (public.get_my_role() = 'admin');
create policy "Admin can manage profiles"
  on public.profiles for all using (public.get_my_role() = 'admin');

-- ── CATEGORIES policies (read: all, write: admin) ──────────
create policy "Anyone can read categories"
  on public.categories for select using (true);
create policy "Admin can manage categories"
  on public.categories for all using (public.get_my_role() = 'admin');

-- ── PRODUCTS policies (read: all, write: admin) ────────────
create policy "Anyone can read products"
  on public.products for select using (true);
create policy "Admin can manage products"
  on public.products for all using (public.get_my_role() = 'admin');

-- ── RECIPES policies (read: all, write: admin) ─────────────
create policy "Anyone can read recipes"
  on public.recipes for select using (true);
create policy "Admin can manage recipes"
  on public.recipes for all using (public.get_my_role() = 'admin');

-- ── ORDERS policies ────────────────────────────────────────
create policy "Sales sees own orders"
  on public.orders for select using (
    salesperson_id = auth.uid() or public.get_my_role() in ('admin','kitchen','accounts')
  );
create policy "Sales can create orders"
  on public.orders for insert with check (
    public.get_my_role() in ('sales','accounts','admin')
  );
create policy "Kitchen can update order status"
  on public.orders for update using (
    public.get_my_role() in ('kitchen','admin','accounts')
  );
create policy "Sales can cancel own orders"
  on public.orders for update
  using (
    public.get_my_role() = 'sales'
    and salesperson_id = auth.uid()
    and status in ('DRAFT','CONFIRMED')
  )
  with check (
    salesperson_id = auth.uid()
    and status = 'CANCELLED'
  );
create policy "Admin full access orders"
  on public.orders for all using (public.get_my_role() = 'admin');

-- Ensure CANCELLED exists in existing projects where enum was already created
do $$
begin
  alter type order_status add value 'CANCELLED';
exception
  when duplicate_object then null;
end $$;

-- ── ORDER ITEMS policies ───────────────────────────────────
create policy "Read order items"
  on public.order_items for select using (true);
create policy "Insert order items"
  on public.order_items for insert with check (
    public.get_my_role() in ('sales','accounts','admin')
  );
create policy "Admin manage order items"
  on public.order_items for all using (public.get_my_role() = 'admin');

-- ── INVOICES policies ──────────────────────────────────────
create policy "Read invoices"
  on public.invoices for select using (true);
create policy "Accounts can manage invoices"
  on public.invoices for all using (
    public.get_my_role() in ('accounts','admin')
  );

-- ── PAYMENTS policies ──────────────────────────────────────
create policy "Read payments"
  on public.payments for select using (true);
create policy "Accounts can manage payments"
  on public.payments for all using (
    public.get_my_role() in ('accounts','admin')
  );

-- ── AUDIT LOGS policies ────────────────────────────────────
create policy "Anyone can insert audit logs"
  on public.audit_logs for insert with check (true);
create policy "Admin can read audit logs"
  on public.audit_logs for select using (public.get_my_role() = 'admin');

-- ── APP SETTINGS policies ─────────────────────────────────
create policy "Authenticated can read app settings"
  on public.app_settings for select using (auth.role() = 'authenticated');
create policy "Admin can manage app settings"
  on public.app_settings for all using (public.get_my_role() = 'admin');

-- ── REALTIME ────────────────────────────────────────────────
alter publication supabase_realtime add table public.orders;
