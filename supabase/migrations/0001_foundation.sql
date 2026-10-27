-- 0001: Üyelik temeli — profiller, adresler, denetim kaydı, dağıtık oran sınırı.
-- Erişim yalnızca sunucu fonksiyonlarından (service role) yapılır; anon ve authenticated için her şey reddedilir.

-- Profiller ---------------------------------------------------------------
create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    full_name text not null check (char_length(full_name) between 2 and 100),
    phone text check (phone is null or char_length(phone) <= 30),
    role text not null default 'customer' check (role in ('customer', 'admin')),
    marketing_consent boolean not null default false,
    marketing_consent_at timestamptz,
    kvkk_accepted_at timestamptz not null,
    deletion_requested_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Adresler ----------------------------------------------------------------
create table public.addresses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,
    title text not null check (char_length(title) between 1 and 40),
    recipient_name text not null check (char_length(recipient_name) between 2 and 100),
    phone text not null check (char_length(phone) <= 30),
    city text not null check (char_length(city) between 2 and 60),
    district text not null check (char_length(district) between 2 and 60),
    neighbourhood text not null check (char_length(neighbourhood) between 2 and 60),
    line text not null check (char_length(line) between 5 and 250),
    postal_code text check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
    is_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index addresses_user_id_idx on public.addresses (user_id);
create unique index addresses_one_default_idx on public.addresses (user_id) where is_default;

-- Denetim kaydı (yalnızca ekleme) --------------------------------------------
create table public.audit_log (
    id bigserial primary key,
    actor_id uuid,
    action text not null,
    target text,
    details jsonb not null default '{}'::jsonb,
    ip text,
    created_at timestamptz not null default now()
);

-- Oran sınırı sayaçları (anahtarlar SHA-256 özetidir) --------------------------
create table public.rate_limits (
    key text primary key,
    count integer not null,
    reset_at timestamptz not null
);

-- Fonksiyonlar ve tetikleyiciler -----------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
    for each row execute function public.set_updated_at();
create trigger addresses_set_updated_at before update on public.addresses
    for each row execute function public.set_updated_at();

-- Yeni kullanıcı için profil oluşturur. Rol asla meta veriden okunmaz (varsayılan customer).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_name text := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
    v_phone text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
    v_marketing boolean := coalesce(new.raw_user_meta_data ->> 'marketing', '') = 'true';
begin
    if coalesce(new.raw_user_meta_data ->> 'kvkk', '') <> 'true' then
        raise exception 'KVKK onayı olmadan kayıt oluşturulamaz';
    end if;
    if char_length(v_name) not between 2 and 100 then
        raise exception 'Geçersiz ad soyad';
    end if;

    insert into public.profiles (id, full_name, phone, marketing_consent, marketing_consent_at, kvkk_accepted_at)
    values (new.id, v_name, v_phone, v_marketing, case when v_marketing then now() end, now());
    return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();

create or replace function public.prevent_audit_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'audit_log yalnızca eklemeye açıktır';
end;
$$;

create trigger audit_log_append_only before update or delete on public.audit_log
    for each row execute function public.prevent_audit_change();

-- Tek ifadede atomik sayaç: pencere dolmuşsa sıfırlar, değilse artırır. true = izinli.
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_count integer;
begin
    insert into public.rate_limits as r (key, count, reset_at)
    values (p_key, 1, now() + make_interval(secs => p_window_seconds))
    on conflict (key) do update
        set count = case when r.reset_at <= now() then 1 else r.count + 1 end,
            reset_at = case when r.reset_at <= now() then now() + make_interval(secs => p_window_seconds) else r.reset_at end
    returning count into v_count;

    -- Süresi çoktan dolmuş sayaçları ara sıra temizle.
    if random() < 0.01 then
        delete from public.rate_limits where reset_at < now() - interval '1 day';
    end if;

    return v_count <= p_max;
end;
$$;

-- Erişim: RLS açık, politika yok; istemci rollerinin tüm yetkileri geri alınır ------
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.addresses from anon, authenticated;
revoke all on table public.audit_log from anon, authenticated;
revoke all on table public.rate_limits from anon, authenticated;
revoke all on sequence public.audit_log_id_seq from anon, authenticated;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
