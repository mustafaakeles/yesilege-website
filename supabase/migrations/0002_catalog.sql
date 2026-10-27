-- 0002: Katalog — kategoriler, ürünler, favoriler ve işletme ayarları.
-- Tutarlar kuruş cinsinden tam sayıdır. Erişim yalnızca sunucu fonksiyonlarından (service role) yapılır.

-- Kategoriler ---------------------------------------------------------------
create table public.categories (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
    name text not null check (char_length(name) between 2 and 60),
    description text check (description is null or char_length(description) <= 500),
    sort_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Ürünler -------------------------------------------------------------------
create table public.products (
    id uuid primary key default gen_random_uuid(),
    slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
    category_id uuid references public.categories (id) on delete set null,
    name text not null check (char_length(name) between 2 and 120),
    summary text check (summary is null or char_length(summary) <= 200),
    description text check (description is null or char_length(description) <= 4000),
    price integer not null check (price between 1 and 100000000),
    compare_at_price integer check (compare_at_price is null or compare_at_price > price),
    stock integer not null default 0 check (stock >= 0),
    shippable boolean not null default true,
    images text[] not null default '{}' check (cardinality(images) <= 6),
    is_active boolean not null default false,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create index products_active_idx on public.products (is_active, sort_order);

-- Favoriler -----------------------------------------------------------------
create table public.favorites (
    user_id uuid not null references public.profiles (id) on delete cascade,
    product_id uuid not null references public.products (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (user_id, product_id)
);
create index favorites_product_idx on public.favorites (product_id);

-- İşletme ayarları (kargo, sadakat, banka, mağaza) --------------------------------
create table public.settings (
    key text primary key check (key in ('shipping', 'loyalty', 'bank', 'store')),
    value jsonb not null check (jsonb_typeof(value) = 'object'),
    updated_at timestamptz not null default now()
);

-- Varsayılanlar yönetim panelinden değiştirilir. Banka bilgisi boşken havale seçeneği gösterilmez.
insert into public.settings (key, value) values
    ('shipping', '{"fee": 15000, "free_threshold": 200000, "weekly_capacity": 20, "order_cutoff_hour": 18}'),
    ('loyalty', '{"points_per_lira": 1, "points_per_unit": 100, "unit_value": 500, "max_ratio": 0.30, "activation_days": 14, "valid_months": 12}'),
    ('bank', '{"bank_name": "", "account_holder": "", "iban": ""}'),
    ('store', '{"pickup_address": "Karaveliler, Kazım Dirik Cd. No: 225, 35847 Bayındır/İzmir", "pickup_hours": "Hafta içi 09:00 – 18:00"}');

create trigger categories_set_updated_at before update on public.categories
    for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
    for each row execute function public.set_updated_at();
create trigger settings_set_updated_at before update on public.settings
    for each row execute function public.set_updated_at();

-- Erişim: RLS açık, politika yok; istemci rollerinin tüm yetkileri geri alınır ------
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.favorites enable row level security;
alter table public.settings enable row level security;

revoke all on table public.categories from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.favorites from anon, authenticated;
revoke all on table public.settings from anon, authenticated;

-- Ürün görselleri: herkese açık okunan, yalnızca sunucunun yazdığı Storage kovası --------
do $$
begin
    if to_regclass('storage.buckets') is not null then
        insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        values ('products', 'products', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
        on conflict (id) do nothing;
    end if;
end;
$$;
