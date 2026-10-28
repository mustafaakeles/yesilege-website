-- 0003: Sipariş, kargo kapasitesi ve sadakat puanı defteri.
-- Para, stok ve puanla ilgili her değişiklik bu dosyadaki fonksiyonlarda, tek işlemde yapılır.
-- Tutarlar kuruştur. Hata mesajları makine kodudur (ör. 'out_of_stock'); API bunları Türkçe metne çevirir.

-- Siparişler ------------------------------------------------------------------
create table public.orders (
    id uuid primary key default gen_random_uuid(),
    code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
    user_id uuid references public.profiles (id) on delete set null,
    status text not null default 'awaiting_payment'
        check (status in ('awaiting_payment', 'paid', 'preparing', 'shipped', 'ready_for_pickup', 'delivered', 'cancelled')),
    payment_method text not null check (payment_method in ('bank_transfer', 'pay_at_store')),
    delivery_method text not null check (delivery_method in ('cargo', 'pickup')),
    ship_date date,
    contact jsonb not null,
    shipping_address jsonb,
    note text check (note is null or char_length(note) <= 500),
    subtotal integer not null check (subtotal > 0),
    shipping_fee integer not null default 0 check (shipping_fee >= 0),
    discount integer not null default 0 check (discount >= 0),
    points_used integer not null default 0 check (points_used >= 0),
    total integer not null check (total >= 0),
    carrier text check (carrier is null or char_length(carrier) <= 60),
    tracking_number text check (tracking_number is null or char_length(tracking_number) <= 60),
    cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 300),
    paid_at timestamptz,
    shipped_at timestamptz,
    delivered_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (total = subtotal + shipping_fee - discount),
    check ((delivery_method = 'cargo') = (ship_date is not null)),
    check (delivery_method = 'pickup' or shipping_address is not null),
    check (payment_method = 'bank_transfer' or delivery_method = 'pickup')
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_ship_date_idx on public.orders (ship_date) where ship_date is not null;

create table public.order_items (
    id bigserial primary key,
    order_id uuid not null references public.orders (id) on delete cascade,
    product_id uuid references public.products (id) on delete set null,
    name text not null,
    unit_price integer not null check (unit_price > 0),
    qty integer not null check (qty between 1 and 99),
    line_total integer not null,
    check (line_total = unit_price * qty)
);
create index order_items_order_idx on public.order_items (order_id);

-- Sipariş geçmişi (yalnızca ekleme)
create table public.order_events (
    id bigserial primary key,
    order_id uuid not null references public.orders (id) on delete cascade,
    status text not null,
    note text,
    actor_id uuid,
    created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, id);

-- Cumartesi toplu kargo kapasitesi
create table public.shipping_batches (
    ship_date date primary key check (extract(isodow from ship_date) = 6),
    capacity integer not null check (capacity >= 0),
    reserved integer not null default 0 check (reserved >= 0)
);

-- Sadakat puanı defteri (yalnızca ekleme; bakiye bu kayıtlardan hesaplanır)
create table public.loyalty_ledger (
    id bigserial primary key,
    user_id uuid not null references public.profiles (id) on delete cascade,
    order_id uuid references public.orders (id) on delete set null,
    kind text not null check (kind in ('earn', 'spend', 'refund', 'reversal', 'adjust')),
    points integer not null check (points <> 0),
    available_at timestamptz not null default now(),
    expires_at timestamptz,
    note text check (note is null or char_length(note) <= 300),
    actor_id uuid,
    created_at timestamptz not null default now(),
    check ((kind in ('earn', 'refund') and points > 0) or (kind in ('spend', 'reversal') and points < 0) or kind = 'adjust')
);
create index loyalty_ledger_user_idx on public.loyalty_ledger (user_id, id);
create unique index loyalty_one_earn_per_order on public.loyalty_ledger (order_id) where kind = 'earn';

create trigger orders_set_updated_at before update on public.orders
    for each row execute function public.set_updated_at();
create trigger order_events_append_only before update or delete on public.order_events
    for each row execute function public.prevent_audit_change();
create trigger loyalty_ledger_append_only before update or delete on public.loyalty_ledger
    for each row execute function public.prevent_audit_change();

-- Yardımcılar ---------------------------------------------------------------------

create or replace function public.setting_int(p_key text, p_field text)
returns integer
language sql
stable
set search_path = ''
as $$
    select (value ->> p_field)::integer from public.settings where key = p_key;
$$;

-- Siparişin kargoya verileceği ilk uygun cumartesi (İstanbul saatiyle; kesim saatinden sonra bir gün kayar).
create or replace function public.first_ship_date(p_now timestamptz default now())
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
    v_local timestamp := p_now at time zone 'Europe/Istanbul';
    v_cutoff integer := coalesce(public.setting_int('shipping', 'order_cutoff_hour'), 18);
    v_day date := v_local::date + case when extract(hour from v_local) >= v_cutoff then 1 else 0 end;
begin
    -- Etkin günden sonraki ilk cumartesi (etkin gün cumartesiyse bir sonraki hafta)
    return v_day + (((6 - extract(isodow from v_day)::integer) + 7) % 7) + case when extract(isodow from v_day) = 6 then 7 else 0 end;
end;
$$;

-- Puan bakiyesi: kullanılabilir lotlar ilk sona erenden başlayarak tüketilir (FIFO).
-- İptal edilen siparişin kazanım geri alımı önce o siparişin kendi kazanımından düşülür.
create or replace function public.loyalty_balance(p_user uuid, p_at timestamptz default now())
returns table (available integer, pending integer)
language plpgsql
stable
set search_path = ''
as $$
declare
    lot_id bigint[] := '{}';
    lot_rem integer[] := '{}';
    lot_from timestamptz[] := '{}';
    lot_until timestamptz[] := '{}';
    lot_order uuid[] := '{}';
    v_deficit integer := 0;
    v_need integer;
    v_take integer;
    v_entry record;
    v_idx integer;
    v_order integer[];
begin
    for v_entry in
        select id, order_id, kind, points, available_at, expires_at, created_at
        from public.loyalty_ledger where user_id = p_user and created_at <= p_at order by id
    loop
        if v_entry.points > 0 then
            lot_id := lot_id || v_entry.id;
            lot_rem := lot_rem || v_entry.points;
            lot_from := lot_from || v_entry.available_at;
            lot_until := lot_until || v_entry.expires_at;
            lot_order := lot_order || v_entry.order_id;
            continue;
        end if;
        v_need := -v_entry.points;
        -- Önce aynı siparişin kazanımı (geri alım), sonra kullanılabilir lotlar ilk sona erenden başlayarak
        select array_agg(i order by (lot_order[i] is not distinct from v_entry.order_id and v_entry.kind = 'reversal') desc,
                                   coalesce(lot_until[i], 'infinity'::timestamptz), lot_id[i])
        into v_order
        from generate_subscripts(lot_id, 1) as i
        where lot_rem[i] > 0
          and ((v_entry.kind = 'reversal' and lot_order[i] is not distinct from v_entry.order_id)
               or (lot_from[i] <= v_entry.created_at and (lot_until[i] is null or lot_until[i] > v_entry.created_at)));
        if v_order is not null then
            foreach v_idx in array v_order loop
                exit when v_need = 0;
                v_take := least(v_need, lot_rem[v_idx]);
                lot_rem[v_idx] := lot_rem[v_idx] - v_take;
                v_need := v_need - v_take;
            end loop;
        end if;
        v_deficit := v_deficit + v_need;
    end loop;

    available := 0;
    pending := 0;
    for v_idx in 1 .. coalesce(array_length(lot_id, 1), 0) loop
        if lot_from[v_idx] > p_at then
            pending := pending + lot_rem[v_idx];
        elsif lot_until[v_idx] is null or lot_until[v_idx] > p_at then
            available := available + lot_rem[v_idx];
        end if;
    end loop;
    available := available - v_deficit;
    return next;
end;
$$;

-- Sepet fiyatı: tek doğruluk kaynağı. Yazma yapmaz; sorunları "errors" dizisinde döndürür.
-- p_items: [{"product_id": uuid, "qty": int}, ...]
create or replace function public.quote_order(p_user uuid, p_items jsonb, p_delivery text, p_points integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    v_lines jsonb := '[]'::jsonb;
    v_errors text[] := '{}';
    v_subtotal integer := 0;
    v_fee integer := 0;
    v_discount integer := 0;
    v_points integer := coalesce(p_points, 0);
    v_max_points integer := 0;
    v_available integer := 0;
    v_shipping jsonb;
    v_loyalty jsonb;
    v_item record;
    v_count integer;
    v_unit integer;
    v_value integer;
begin
    if p_delivery not in ('cargo', 'pickup') then
        v_errors := v_errors || 'invalid_delivery'::text;
    end if;
    if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
        return jsonb_build_object('errors', jsonb_build_array('cart_empty'), 'lines', '[]'::jsonb);
    end if;
    if jsonb_array_length(p_items) > 30 then
        return jsonb_build_object('errors', jsonb_build_array('too_many_lines'), 'lines', '[]'::jsonb);
    end if;

    select value into v_shipping from public.settings where key = 'shipping';
    select value into v_loyalty from public.settings where key = 'loyalty';

    for v_item in
        with raw as (
            select (elem ->> 'product_id') as product_id, (elem ->> 'qty') as qty
            from jsonb_array_elements(p_items) as elem
        ),
        valid as (
            select product_id::uuid as product_id, sum(qty::integer) as qty
            from raw
            where product_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and qty ~ '^[0-9]{1,2}$'
            group by 1
        )
        select v.product_id, v.qty, p.name, p.slug, p.price, p.stock, p.shippable, p.is_active, p.images
        from valid v left join public.products p on p.id = v.product_id
        order by p.name
    loop
        if v_item.name is null or not v_item.is_active then
            v_errors := v_errors || 'product_unavailable'::text;
            continue;
        end if;
        if v_item.qty < 1 or v_item.qty > 99 then
            v_errors := v_errors || 'invalid_qty'::text;
            continue;
        end if;
        if v_item.stock < v_item.qty then
            v_errors := v_errors || 'out_of_stock'::text;
        end if;
        if p_delivery = 'cargo' and not v_item.shippable then
            v_errors := v_errors || 'not_shippable'::text;
        end if;
        v_subtotal := v_subtotal + v_item.price * v_item.qty;
        v_lines := v_lines || jsonb_build_object(
            'product_id', v_item.product_id, 'name', v_item.name, 'slug', v_item.slug, 'unit_price', v_item.price,
            'qty', v_item.qty, 'line_total', v_item.price * v_item.qty, 'stock_ok', v_item.stock >= v_item.qty,
            'shippable', v_item.shippable, 'image', v_item.images[1]);
    end loop;

    select count(*) into v_count from jsonb_array_elements(p_items) as elem
    where not ((elem ->> 'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and (elem ->> 'qty') ~ '^[0-9]{1,2}$');
    if v_count > 0 then
        v_errors := v_errors || 'invalid_qty'::text;
    end if;

    if p_delivery = 'cargo' and v_subtotal > 0 and v_subtotal < (v_shipping ->> 'free_threshold')::integer then
        v_fee := (v_shipping ->> 'fee')::integer;
    end if;

    -- Puan: birim (100 puan) katları; ara toplamın en fazla %30'u; yalnızca kullanılabilir bakiye
    v_unit := (v_loyalty ->> 'points_per_unit')::integer;
    v_value := (v_loyalty ->> 'unit_value')::integer;
    if p_user is not null then
        select greatest(b.available, 0) into v_available from public.loyalty_balance(p_user) as b;
    end if;
    v_max_points := least(v_available, (floor(v_subtotal * (v_loyalty ->> 'max_ratio')::numeric / v_value)::integer) * v_unit);
    v_max_points := v_max_points - (v_max_points % v_unit);
    if v_points < 0 or v_points % v_unit <> 0 then
        v_errors := v_errors || 'points_invalid'::text;
    elsif v_points > 0 and p_user is null then
        v_errors := v_errors || 'points_invalid'::text;
    elsif v_points > v_available then
        v_errors := v_errors || 'points_insufficient'::text;
    elsif v_points > v_max_points then
        v_errors := v_errors || 'points_exceed'::text;
    else
        v_discount := (v_points / v_unit) * v_value;
    end if;

    return jsonb_build_object(
        'lines', v_lines,
        'subtotal', v_subtotal,
        'shipping_fee', v_fee,
        'free_threshold', (v_shipping ->> 'free_threshold')::integer,
        'discount', v_discount,
        'points', case when v_discount > 0 then v_points else 0 end,
        'available_points', v_available,
        'max_points', v_max_points,
        'total', v_subtotal + v_fee - v_discount,
        'ship_date', case when p_delivery = 'cargo' then public.first_ship_date() end,
        'errors', to_jsonb(array(select distinct unnest(v_errors)))
    );
end;
$$;

-- Kargo tarihi ayırır: kapasitesi dolu cumartesi atlanır (en fazla 8 hafta ileri).
create or replace function public.reserve_ship_date()
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_date date := public.first_ship_date();
    v_capacity integer := coalesce(public.setting_int('shipping', 'weekly_capacity'), 0);
    v_batch record;
begin
    for i in 1 .. 8 loop
        insert into public.shipping_batches (ship_date, capacity) values (v_date, v_capacity) on conflict (ship_date) do nothing;
        select * into v_batch from public.shipping_batches where ship_date = v_date for update;
        if v_batch.reserved < v_batch.capacity then
            update public.shipping_batches set reserved = reserved + 1 where ship_date = v_date;
            return v_date;
        end if;
        v_date := v_date + 7;
    end loop;
    raise exception 'capacity_full';
end;
$$;

-- Sipariş oluşturur: doğrulanmış e-posta, kilitli stok ve puan, sunucuda hesaplanan tutar.
create or replace function public.place_order(
    p_user uuid, p_items jsonb, p_delivery text, p_payment text, p_address jsonb, p_contact jsonb,
    p_note text default null, p_points integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_quote jsonb;
    v_order_id uuid;
    v_code text;
    v_ship date;
    v_line jsonb;
begin
    if not exists (select 1 from auth.users where id = p_user and email_confirmed_at is not null) then
        raise exception 'email_not_verified';
    end if;
    if p_payment not in ('bank_transfer', 'pay_at_store') or (p_payment = 'pay_at_store' and p_delivery <> 'pickup') then
        raise exception 'invalid_payment';
    end if;
    if p_payment = 'bank_transfer' and coalesce((select value ->> 'iban' from public.settings where key = 'bank'), '') = '' then
        raise exception 'bank_unavailable';
    end if;
    if p_delivery = 'cargo' and (p_address is null or jsonb_typeof(p_address) <> 'object') then
        raise exception 'address_required';
    end if;

    -- Aynı kullanıcının eşzamanlı siparişleri ve puan harcaması sıraya girer; ürün satırları kilitlenir.
    perform 1 from public.profiles where id = p_user for update;
    perform 1 from public.products
    where id in (select (elem ->> 'product_id')::uuid from jsonb_array_elements(p_items) as elem
                 where (elem ->> 'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    order by id for update;

    v_quote := public.quote_order(p_user, p_items, p_delivery, p_points);
    if jsonb_array_length(v_quote -> 'errors') > 0 then
        raise exception '%', v_quote -> 'errors' ->> 0;
    end if;

    if p_delivery = 'cargo' then
        v_ship := public.reserve_ship_date();
    end if;

    -- Tahmin edilemeyen, karıştırılması zor harflerden oluşan 8 karakterlik sipariş kodu
    loop
        v_code := '';
        for i in 1 .. 8 loop
            v_code := v_code || substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::integer, 1);
        end loop;
        exit when not exists (select 1 from public.orders where code = v_code);
    end loop;

    insert into public.orders (code, user_id, payment_method, delivery_method, ship_date, contact, shipping_address, note,
                               subtotal, shipping_fee, discount, points_used, total)
    values (v_code, p_user, p_payment, p_delivery, v_ship, p_contact, case when p_delivery = 'cargo' then p_address end,
            nullif(btrim(coalesce(p_note, '')), ''), (v_quote ->> 'subtotal')::integer, (v_quote ->> 'shipping_fee')::integer,
            (v_quote ->> 'discount')::integer, (v_quote ->> 'points')::integer, (v_quote ->> 'total')::integer)
    returning id into v_order_id;

    for v_line in select * from jsonb_array_elements(v_quote -> 'lines') loop
        insert into public.order_items (order_id, product_id, name, unit_price, qty, line_total)
        values (v_order_id, (v_line ->> 'product_id')::uuid, v_line ->> 'name', (v_line ->> 'unit_price')::integer,
                (v_line ->> 'qty')::integer, (v_line ->> 'line_total')::integer);
        update public.products set stock = stock - (v_line ->> 'qty')::integer where id = (v_line ->> 'product_id')::uuid;
    end loop;

    if (v_quote ->> 'points')::integer > 0 then
        insert into public.loyalty_ledger (user_id, order_id, kind, points, note)
        values (p_user, v_order_id, 'spend', -(v_quote ->> 'points')::integer, 'Sipariş ' || v_code);
    end if;

    insert into public.order_events (order_id, status, actor_id) values (v_order_id, 'awaiting_payment', p_user);

    return jsonb_build_object('id', v_order_id, 'code', v_code, 'total', (v_quote ->> 'total')::integer,
                              'ship_date', v_ship, 'points', (v_quote ->> 'points')::integer);
end;
$$;

-- İptal: stok ve kargo kapasitesi iade edilir, harcanan puan geri yüklenir, kazanılan puan geri alınır.
-- Müşteri yalnızca ödeme beklenen kendi siparişini iptal edebilir; yönetici teslim edilmiş siparişi de iptal (iade) edebilir.
create or replace function public.cancel_order(p_order uuid, p_actor uuid, p_admin boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_order public.orders;
    v_item record;
    v_spent integer;
    v_earned integer;
    v_valid_months integer := coalesce(public.setting_int('loyalty', 'valid_months'), 12);
begin
    select * into v_order from public.orders where id = p_order for update;
    if not found or (not p_admin and v_order.user_id is distinct from p_actor) then
        raise exception 'order_not_found';
    end if;
    if v_order.status = 'cancelled' then
        raise exception 'already_cancelled';
    end if;
    if not p_admin and v_order.status <> 'awaiting_payment' then
        raise exception 'cannot_cancel';
    end if;

    -- Henüz gönderilmemiş ürünler stoğa döner
    if v_order.status not in ('shipped', 'delivered') then
        for v_item in select product_id, qty from public.order_items where order_id = p_order and product_id is not null loop
            update public.products set stock = stock + v_item.qty where id = v_item.product_id;
        end loop;
        if v_order.ship_date is not null then
            update public.shipping_batches set reserved = greatest(reserved - 1, 0) where ship_date = v_order.ship_date;
        end if;
    end if;

    if v_order.user_id is not null then
        select coalesce(-sum(points), 0) into v_spent from public.loyalty_ledger where order_id = p_order and kind = 'spend';
        if v_spent > 0 then
            insert into public.loyalty_ledger (user_id, order_id, kind, points, expires_at, note, actor_id)
            values (v_order.user_id, p_order, 'refund', v_spent, now() + make_interval(months => v_valid_months),
                    'İptal: sipariş ' || v_order.code, p_actor);
        end if;
        select coalesce(sum(points), 0) into v_earned from public.loyalty_ledger where order_id = p_order and kind = 'earn';
        if v_earned > 0 then
            insert into public.loyalty_ledger (user_id, order_id, kind, points, note, actor_id)
            values (v_order.user_id, p_order, 'reversal', -v_earned, 'İade: sipariş ' || v_order.code, p_actor);
        end if;
    end if;

    update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where id = p_order;
    insert into public.order_events (order_id, status, note, actor_id) values (p_order, 'cancelled', p_reason, p_actor);
end;
$$;

-- Yönetici durum geçişleri. Ödeme yalnızca burada "alındı" olur; teslimde puan kazanılır (14 gün sonra aktif).
create or replace function public.admin_set_order_status(
    p_order uuid, p_status text, p_actor uuid, p_note text default null, p_carrier text default null, p_tracking text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_order public.orders;
    v_allowed text[];
    v_points integer;
    v_loyalty jsonb;
    v_available timestamptz;
begin
    select * into v_order from public.orders where id = p_order for update;
    if not found then
        raise exception 'order_not_found';
    end if;

    v_allowed := case v_order.status
        when 'awaiting_payment' then case when v_order.payment_method = 'pay_at_store' then array['preparing', 'ready_for_pickup'] else array['paid'] end
        when 'paid' then array['preparing', case when v_order.delivery_method = 'cargo' then 'shipped' else 'ready_for_pickup' end]
        when 'preparing' then array[case when v_order.delivery_method = 'cargo' then 'shipped' else 'ready_for_pickup' end]
        when 'shipped' then array['delivered']
        when 'ready_for_pickup' then array['delivered']
        else array[]::text[]
    end;
    if not (p_status = any (v_allowed)) then
        raise exception 'invalid_transition';
    end if;

    update public.orders set
        status = p_status,
        paid_at = case when p_status = 'paid' or (p_status = 'delivered' and paid_at is null) then now() else paid_at end,
        shipped_at = case when p_status = 'shipped' then now() else shipped_at end,
        delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
        carrier = coalesce(nullif(btrim(coalesce(p_carrier, '')), ''), carrier),
        tracking_number = coalesce(nullif(btrim(coalesce(p_tracking, '')), ''), tracking_number)
    where id = p_order;
    insert into public.order_events (order_id, status, note, actor_id) values (p_order, p_status, p_note, p_actor);

    if p_status = 'delivered' and v_order.user_id is not null then
        select value into v_loyalty from public.settings where key = 'loyalty';
        v_points := floor((v_order.subtotal - v_order.discount) / 100.0 * (v_loyalty ->> 'points_per_lira')::numeric)::integer;
        if v_points > 0 then
            v_available := now() + make_interval(days => (v_loyalty ->> 'activation_days')::integer);
            insert into public.loyalty_ledger (user_id, order_id, kind, points, available_at, expires_at, note, actor_id)
            values (v_order.user_id, p_order, 'earn', v_points, v_available,
                    v_available + make_interval(months => (v_loyalty ->> 'valid_months')::integer), 'Sipariş ' || v_order.code, p_actor)
            on conflict do nothing;
        end if;
    end if;
end;
$$;

-- Yönetici puan düzeltmesi (ters kayıt mantığı: defterde hiçbir kayıt değiştirilmez)
create or replace function public.admin_adjust_points(p_user uuid, p_points integer, p_note text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_months integer := coalesce(public.setting_int('loyalty', 'valid_months'), 12);
begin
    if p_points = 0 or abs(p_points) > 100000 or char_length(btrim(coalesce(p_note, ''))) < 3 then
        raise exception 'invalid_adjustment';
    end if;
    perform 1 from public.profiles where id = p_user for update;
    if not found then
        raise exception 'user_not_found';
    end if;
    insert into public.loyalty_ledger (user_id, kind, points, expires_at, note, actor_id)
    values (p_user, 'adjust', p_points, case when p_points > 0 then now() + make_interval(months => v_months) end, btrim(p_note), p_actor);
end;
$$;

-- Erişim: RLS açık, politika yok; istemci rolleri tablolara ve fonksiyonlara erişemez ---------
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.shipping_batches enable row level security;
alter table public.loyalty_ledger enable row level security;

revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.order_events from anon, authenticated;
revoke all on table public.shipping_batches from anon, authenticated;
revoke all on table public.loyalty_ledger from anon, authenticated;
revoke all on sequence public.order_items_id_seq from anon, authenticated;
revoke all on sequence public.order_events_id_seq from anon, authenticated;
revoke all on sequence public.loyalty_ledger_id_seq from anon, authenticated;

revoke execute on function public.setting_int(text, text) from public, anon, authenticated;
revoke execute on function public.first_ship_date(timestamptz) from public, anon, authenticated;
revoke execute on function public.loyalty_balance(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.quote_order(uuid, jsonb, text, integer) from public, anon, authenticated;
revoke execute on function public.reserve_ship_date() from public, anon, authenticated;
revoke execute on function public.place_order(uuid, jsonb, text, text, jsonb, jsonb, text, integer) from public, anon, authenticated;
revoke execute on function public.cancel_order(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.admin_set_order_status(uuid, text, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.admin_adjust_points(uuid, integer, text, uuid) from public, anon, authenticated;

grant execute on function public.loyalty_balance(uuid, timestamptz) to service_role;
grant execute on function public.quote_order(uuid, jsonb, text, integer) to service_role;
grant execute on function public.place_order(uuid, jsonb, text, text, jsonb, jsonb, text, integer) to service_role;
grant execute on function public.cancel_order(uuid, uuid, boolean, text) to service_role;
grant execute on function public.admin_set_order_status(uuid, text, uuid, text, text, text) to service_role;
grant execute on function public.admin_adjust_points(uuid, integer, text, uuid) to service_role;
