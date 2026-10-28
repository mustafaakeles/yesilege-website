-- 0003 migration testleri: spec §4'teki saldırı senaryolarının veritabanı seviyesinde reddedildiğini kanıtlar.
-- Tüm değişiklikler geri alınır; başarı "0003 testleri geçti" bildirimiyle görünür.
begin;

create temporary table t_ctx (key text primary key, id uuid) on commit drop;

-- Ortak veri: doğrulanmış/doğrulanmamış iki müşteri, iki ürün, banka bilgisi
do $$
declare
    v_cat uuid;
begin
    insert into public.categories (slug, name) values ('t3-kategori', 'T3 Kategori') returning id into v_cat;
    insert into t_ctx values ('cat', v_cat);
    with x as (insert into public.products (slug, category_id, name, price, stock, is_active)
               values ('t3-kargo', v_cat, 'T3 Kargo Ürünü', 10000, 5, true) returning id)
    insert into t_ctx select 'kargo', id from x;
    with x as (insert into public.products (slug, category_id, name, price, stock, shippable, is_active)
               values ('t3-fidan', v_cat, 'T3 Fidan', 50000, 2, false, true) returning id)
    insert into t_ctx select 'fidan', id from x;
    with x as (insert into public.products (slug, category_id, name, price, stock, is_active)
               values ('t3-pasif', v_cat, 'T3 Pasif', 1000, 5, false) returning id)
    insert into t_ctx select 'pasif', id from x;
    insert into t_ctx values ('ayse', gen_random_uuid()), ('mehmet', gen_random_uuid()), ('admin', gen_random_uuid());
    insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
    select id, key || '@test.invalid', jsonb_build_object('full_name', 'Test ' || key, 'kvkk', 'true'),
           case when key = 'mehmet' then null else now() end
    from t_ctx where key in ('ayse', 'mehmet', 'admin');
    update public.settings set value = value || '{"iban": "TR000000000000000000000000", "bank_name": "Test", "account_holder": "Test"}' where key = 'bank';
    update public.settings set value = value || '{"weekly_capacity": 1, "free_threshold": 30000, "fee": 2500}' where key = 'shipping';
end;
$$;

create or replace function pg_temp.id(p_key text) returns uuid language sql as $$ select id from t_ctx where key = p_key $$;
create or replace function pg_temp.items(p_key text, p_qty integer) returns jsonb language sql as $$
    select jsonb_build_array(jsonb_build_object('product_id', pg_temp.id(p_key), 'qty', p_qty)) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
    execute p_sql;
    raise exception 'BAŞARISIZ: hata bekleniyordu (%)', p_code;
exception when others then
    if sqlerrm like 'BAŞARISIZ%' then raise; end if;
    if sqlerrm <> p_code then raise exception 'BAŞARISIZ: % yerine % hatası', p_code, sqlerrm; end if;
end;
$$;

-- 1) İstemci rolleri sipariş tablolarına ve fonksiyonlarına erişemez
do $$
declare
    r text;
begin
    foreach r in array array['anon', 'authenticated'] loop
        execute format('set local role %I', r);
        begin
            perform count(*) from public.orders;
            raise exception 'BAŞARISIZ: % orders tablosunu okudu', r;
        exception when insufficient_privilege then null;
        end;
        begin
            perform count(*) from public.loyalty_ledger;
            raise exception 'BAŞARISIZ: % puan defterini okudu', r;
        exception when insufficient_privilege then null;
        end;
        begin
            perform public.place_order(gen_random_uuid(), '[]', 'pickup', 'pay_at_store', null, '{}');
            raise exception 'BAŞARISIZ: % place_order çalıştırdı', r;
        exception when insufficient_privilege then null;
        end;
        begin
            perform public.admin_set_order_status(gen_random_uuid(), 'paid', gen_random_uuid());
            raise exception 'BAŞARISIZ: % yönetici fonksiyonunu çalıştırdı', r;
        exception when insufficient_privilege then null;
        end;
        reset role;
    end loop;
end;
$$;

-- 2) Doğrulanmamış e-posta, geçersiz adet, pasif ürün, kargoya uygun olmayan ürün ve stok aşımı reddedilir
do $$
begin
    perform pg_temp.expect_error(format($q$select public.place_order(%L, pg_temp.items('kargo', 1), 'pickup', 'pay_at_store', null, '{}')$q$, pg_temp.id('mehmet')), 'email_not_verified');
    perform pg_temp.expect_error(format($q$select public.place_order(%L, pg_temp.items('kargo', 0), 'pickup', 'pay_at_store', null, '{}')$q$, pg_temp.id('ayse')), 'invalid_qty');
    perform pg_temp.expect_error(format($q$select public.place_order(%L, pg_temp.items('kargo', 100), 'pickup', 'pay_at_store', null, '{}')$q$, pg_temp.id('ayse')), 'invalid_qty');
    perform pg_temp.expect_error(format($q$select public.place_order(%L, '[{"product_id":"%s","qty":"-1"}]', 'pickup', 'pay_at_store', null, '{}')$q$, pg_temp.id('ayse'), pg_temp.id('kargo')), 'invalid_qty');
    perform pg_temp.expect_error(format($q$select public.place_order(%L, pg_temp.items('pasif', 1), 'pickup', 'pay_at_store', null, '{}')$q$, pg_temp.id('ayse')), 'product_unavailable');
    perform pg_temp.expect_error(format($q$select public.place_order(%L, pg_temp.items('fidan', 1), 'cargo', 'bank_transfer', '{"city":"İzmir"}', '{}')$q$, pg_temp.id('ayse')), 'not_shippable');
    perform pg_temp.expect_error(format($q$select public.place_order(%L, pg_temp.items('fidan', 3), 'pickup', 'pay_at_store', null, '{}')$q$, pg_temp.id('ayse')), 'out_of_stock');
    perform pg_temp.expect_error(format($q$select public.place_order(%L, pg_temp.items('kargo', 1), 'cargo', 'pay_at_store', '{"city":"İzmir"}', '{}')$q$, pg_temp.id('ayse')), 'invalid_payment');
    perform pg_temp.expect_error(format($q$select public.place_order(%L, pg_temp.items('kargo', 1), 'cargo', 'bank_transfer', null, '{}')$q$, pg_temp.id('ayse')), 'address_required');
    perform pg_temp.expect_error(format($q$select public.place_order(%L, '[]', 'pickup', 'pay_at_store', null, '{}')$q$, pg_temp.id('ayse')), 'cart_empty');
end;
$$;

-- 3) Tutar istemciden alınmaz: gövdedeki fiyat alanı yok sayılır; kargo ücreti ve stok sunucuda hesaplanır
do $$
declare
    v_result jsonb;
    v_order public.orders;
begin
    v_result := public.place_order(pg_temp.id('ayse'),
        jsonb_build_array(jsonb_build_object('product_id', pg_temp.id('kargo'), 'qty', 2, 'price', 1, 'unit_price', 1)),
        'cargo', 'bank_transfer', '{"city":"İzmir","line":"Test"}', '{"name":"Test"}', null, 0);
    select * into v_order from public.orders where id = (v_result ->> 'id')::uuid;
    if v_order.subtotal <> 20000 or v_order.shipping_fee <> 2500 or v_order.total <> 22500 then
        raise exception 'BAŞARISIZ: tutar yanlış hesaplandı (% / % / %)', v_order.subtotal, v_order.shipping_fee, v_order.total;
    end if;
    if extract(isodow from v_order.ship_date) <> 6 then
        raise exception 'BAŞARISIZ: kargo tarihi cumartesi değil';
    end if;
    if (select stock from public.products where id = pg_temp.id('kargo')) <> 3 then
        raise exception 'BAŞARISIZ: stok düşülmedi';
    end if;
    if v_order.code !~ '^[A-Z0-9]{8}$' then
        raise exception 'BAŞARISIZ: sipariş kodu biçimi';
    end if;
    insert into t_ctx values ('siparis1', v_order.id);

    -- Haftalık kapasite 1: ikinci kargo siparişi bir sonraki cumartesiye kayar
    v_result := public.place_order(pg_temp.id('ayse'), pg_temp.items('kargo', 1), 'cargo', 'bank_transfer', '{"city":"İzmir"}', '{}');
    if (v_result ->> 'ship_date')::date <> v_order.ship_date + 7 then
        raise exception 'BAŞARISIZ: dolu cumartesi atlanmadı';
    end if;
    insert into t_ctx values ('siparis2', (v_result ->> 'id')::uuid);

    -- Ücretsiz kargo eşiği
    if (public.quote_order(pg_temp.id('ayse'), pg_temp.items('kargo', 3), 'cargo') ->> 'shipping_fee')::integer <> 0 then
        raise exception 'BAŞARISIZ: ücretsiz kargo eşiği uygulanmadı';
    end if;
end;
$$;

-- 4) Ödeme yalnızca yönetici geçişiyle alınır; geçersiz geçişler ve başkasının iptali reddedilir
do $$
begin
    perform pg_temp.expect_error(format($q$select public.admin_set_order_status(%L, 'delivered', %L)$q$, pg_temp.id('siparis1'), pg_temp.id('admin')), 'invalid_transition');
    perform pg_temp.expect_error(format($q$select public.cancel_order(%L, %L, false)$q$, pg_temp.id('siparis1'), pg_temp.id('mehmet')), 'order_not_found');
    perform public.admin_set_order_status(pg_temp.id('siparis1'), 'paid', pg_temp.id('admin'));
    if (select paid_at from public.orders where id = pg_temp.id('siparis1')) is null then
        raise exception 'BAŞARISIZ: paid_at yazılmadı';
    end if;
    perform pg_temp.expect_error(format($q$select public.cancel_order(%L, %L, false)$q$, pg_temp.id('siparis1'), pg_temp.id('ayse')), 'cannot_cancel');
    perform public.admin_set_order_status(pg_temp.id('siparis1'), 'shipped', pg_temp.id('admin'), null, 'Test Kargo', 'TK123');
    perform public.admin_set_order_status(pg_temp.id('siparis1'), 'delivered', pg_temp.id('admin'));
end;
$$;

-- 5) Puan yalnızca ödenmiş ve teslim edilmiş siparişten doğar, 14 gün sonra aktifleşir
do $$
declare
    v_balance record;
begin
    select * into v_balance from public.loyalty_balance(pg_temp.id('ayse'));
    if v_balance.available <> 0 or v_balance.pending <> 200 then
        raise exception 'BAŞARISIZ: teslimden hemen sonra bakiye % / bekleyen %', v_balance.available, v_balance.pending;
    end if;
    select * into v_balance from public.loyalty_balance(pg_temp.id('ayse'), now() + interval '15 days');
    if v_balance.available <> 200 then
        raise exception 'BAŞARISIZ: 15 gün sonra puan aktifleşmedi (%)', v_balance.available;
    end if;
    select * into v_balance from public.loyalty_balance(pg_temp.id('ayse'), now() + interval '13 months');
    if v_balance.available <> 0 then
        raise exception 'BAŞARISIZ: süresi dolan puan hâlâ kullanılabilir';
    end if;
    perform pg_temp.expect_error(format($q$select public.admin_set_order_status(%L, 'delivered', %L)$q$, pg_temp.id('siparis1'), pg_temp.id('admin')), 'invalid_transition');
end;
$$;

-- 6) Puan harcama: bakiye, birim katı ve %30 sınırı; iptalde puan ve stok geri gelir
do $$
declare
    v_result jsonb;
    v_balance record;
begin
    -- Aktif puan (test kurulumu: doğrudan defter kaydı)
    insert into public.loyalty_ledger (user_id, kind, points, available_at, expires_at, note)
    values (pg_temp.id('ayse'), 'adjust', 1000, now() - interval '1 day', now() + interval '1 year', 'test');
    perform pg_temp.expect_error(format($q$select public.place_order(%L, pg_temp.items('kargo', 1), 'pickup', 'pay_at_store', null, '{}', null, 150)$q$, pg_temp.id('ayse')), 'points_invalid');
    perform pg_temp.expect_error(format($q$select public.place_order(%L, pg_temp.items('kargo', 1), 'pickup', 'pay_at_store', null, '{}', null, 1100)$q$, pg_temp.id('ayse')), 'points_insufficient');
    -- 10000 kuruşluk ara toplamın %30'u = 3000 kuruş = 600 puan
    perform pg_temp.expect_error(format($q$select public.place_order(%L, pg_temp.items('kargo', 1), 'pickup', 'pay_at_store', null, '{}', null, 700)$q$, pg_temp.id('ayse')), 'points_exceed');
    perform pg_temp.expect_error(format($q$select public.place_order(%L, pg_temp.items('kargo', 1), 'pickup', 'pay_at_store', null, '{}', null, 100)$q$, pg_temp.id('mehmet')), 'email_not_verified');

    v_result := public.place_order(pg_temp.id('ayse'), pg_temp.items('kargo', 1), 'pickup', 'pay_at_store', null, '{}', null, 600);
    if (v_result ->> 'total')::integer <> 7000 then
        raise exception 'BAŞARISIZ: puan indirimi yanlış (%)', v_result ->> 'total';
    end if;
    select * into v_balance from public.loyalty_balance(pg_temp.id('ayse'));
    if v_balance.available <> 400 then
        raise exception 'BAŞARISIZ: harcama sonrası bakiye %', v_balance.available;
    end if;

    perform public.cancel_order((v_result ->> 'id')::uuid, pg_temp.id('ayse'), false, 'vazgeçtim');
    select * into v_balance from public.loyalty_balance(pg_temp.id('ayse'));
    if v_balance.available <> 1000 then
        raise exception 'BAŞARISIZ: iptalde puan geri yüklenmedi (%)', v_balance.available;
    end if;
    perform pg_temp.expect_error(format($q$select public.cancel_order(%L, %L, false)$q$, v_result ->> 'id', pg_temp.id('ayse')), 'already_cancelled');
end;
$$;

-- 7) Teslim edilen siparişin iadesi kazanılan puanı geri alır; kargo kapasitesi ve stok iptalde iade edilir
do $$
declare
    v_balance record;
    v_reserved integer;
    v_stock integer;
begin
    perform public.cancel_order(pg_temp.id('siparis1'), pg_temp.id('admin'), true, 'iade');
    select * into v_balance from public.loyalty_balance(pg_temp.id('ayse'), now() + interval '15 days');
    if v_balance.available <> 1000 or v_balance.pending <> 0 then
        raise exception 'BAŞARISIZ: iade sonrası kazanım geri alınmadı (% / %)', v_balance.available, v_balance.pending;
    end if;

    select reserved into v_reserved from public.shipping_batches where ship_date = (select ship_date from public.orders where id = pg_temp.id('siparis2'));
    select stock into v_stock from public.products where id = pg_temp.id('kargo');
    perform public.cancel_order(pg_temp.id('siparis2'), pg_temp.id('ayse'), false);
    if (select reserved from public.shipping_batches where ship_date = (select ship_date from public.orders where id = pg_temp.id('siparis2'))) <> v_reserved - 1 then
        raise exception 'BAŞARISIZ: kargo kapasitesi iade edilmedi';
    end if;
    if (select stock from public.products where id = pg_temp.id('kargo')) <> v_stock + 1 then
        raise exception 'BAŞARISIZ: iptalde stok geri eklenmedi';
    end if;
end;
$$;

-- 8) Defter ve sipariş geçmişi değiştirilemez; elle düzeltme açıklama ister
do $$
begin
    begin
        update public.loyalty_ledger set points = 999999 where user_id = pg_temp.id('ayse');
        raise exception 'BAŞARISIZ: puan defteri güncellendi';
    exception when raise_exception then
        if sqlerrm like 'BAŞARISIZ%' then raise; end if;
    end;
    begin
        delete from public.order_events;
        raise exception 'BAŞARISIZ: sipariş geçmişi silindi';
    exception when raise_exception then
        if sqlerrm like 'BAŞARISIZ%' then raise; end if;
    end;
    perform pg_temp.expect_error(format($q$select public.admin_adjust_points(%L, 50, '', %L)$q$, pg_temp.id('ayse'), pg_temp.id('admin')), 'invalid_adjustment');
end;
$$;

do $$ begin raise notice '0003 testleri geçti'; end; $$;
rollback;
