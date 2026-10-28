-- 0004: Yönetim paneli yardımcıları. Yönetici yetkisi API'de (rol + TOTP/AAL2) denetlenir;
-- bu fonksiyonlar yalnızca sunucu (service role) tarafından çağrılabilir.

-- E-posta ile müşteri bulma (puan düzeltmesi için). auth.users'a yalnızca bu dar fonksiyon üzerinden erişilir.
create or replace function public.admin_find_user(p_email text)
returns table (id uuid, email text, full_name text, phone text, role text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
    select u.id, u.email::text, p.full_name, p.phone, p.role, p.created_at
    from auth.users u
    join public.profiles p on p.id = u.id
    where lower(u.email) = lower(btrim(p_email))
    limit 1;
$$;

-- Panel özeti: durumlara göre sipariş sayıları ve yaklaşan kargo günleri
create or replace function public.admin_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'by_status', coalesce((select jsonb_object_agg(status, total) from (
            select status, count(*) as total from public.orders group by status) s), '{}'::jsonb),
        'revenue_30d', coalesce((select sum(total) from public.orders
            where paid_at >= now() - interval '30 days' and status <> 'cancelled'), 0),
        'batches', coalesce((select jsonb_agg(jsonb_build_object('ship_date', b.ship_date, 'capacity', b.capacity, 'reserved', b.reserved) order by b.ship_date)
            from public.shipping_batches b where b.ship_date >= current_date), '[]'::jsonb),
        'low_stock', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'slug', p.slug, 'stock', p.stock) order by p.stock, p.name)
            from public.products p where p.is_active and p.stock <= 3), '[]'::jsonb),
        'next_ship_date', public.first_ship_date()
    );
$$;

-- Haftalık kapasite değişince henüz gelmemiş cumartesilere de uygulanır
create or replace function public.admin_set_weekly_capacity(p_capacity integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_capacity < 0 or p_capacity > 1000 then
        raise exception 'invalid_capacity';
    end if;
    update public.shipping_batches set capacity = greatest(p_capacity, reserved) where ship_date >= current_date;
end;
$$;

revoke execute on function public.admin_find_user(text) from public, anon, authenticated;
revoke execute on function public.admin_dashboard() from public, anon, authenticated;
revoke execute on function public.admin_set_weekly_capacity(integer) from public, anon, authenticated;
grant execute on function public.admin_find_user(text) to service_role;
grant execute on function public.admin_dashboard() to service_role;
grant execute on function public.admin_set_weekly_capacity(integer) to service_role;
