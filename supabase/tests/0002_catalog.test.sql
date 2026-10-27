-- 0002 migration testleri. Tüm değişiklikler geri alınır; başarı "0002 testleri geçti" bildirimiyle görünür.
begin;

-- 1) anon ve authenticated rolleri katalog tablolarına erişemez.
do $$
declare
    r text;
    t text;
begin
    foreach r in array array['anon', 'authenticated'] loop
        foreach t in array array['categories', 'products', 'favorites', 'settings'] loop
            execute format('set local role %I', r);
            begin
                execute format('select count(*) from public.%I', t);
                raise exception 'BAŞARISIZ: % rolü % tablosunu okuyabildi', r, t;
            exception when insufficient_privilege then
                null;
            end;
            reset role;
        end loop;
    end loop;
end;
$$;

-- 2) Fiyat, stok ve kısa ad kuralları veritabanında da uygulanır.
do $$
declare
    v_cat uuid;
begin
    insert into public.categories (slug, name) values ('test-kategori', 'Test Kategori') returning id into v_cat;
    begin
        insert into public.products (slug, category_id, name, price) values ('sifir-fiyat', v_cat, 'Sıfır Fiyat', 0);
        raise exception 'BAŞARISIZ: sıfır fiyatlı ürün eklendi';
    exception when check_violation then null;
    end;
    begin
        insert into public.products (slug, name, price, stock) values ('eksi-stok', 'Eksi Stok', 100, -1);
        raise exception 'BAŞARISIZ: eksi stok kabul edildi';
    exception when check_violation then null;
    end;
    begin
        insert into public.products (slug, name, price) values ('Buyuk Harf', 'Geçersiz Kısa Ad', 100);
        raise exception 'BAŞARISIZ: geçersiz kısa ad kabul edildi';
    exception when check_violation then null;
    end;
    begin
        insert into public.products (slug, name, price, compare_at_price) values ('ucuz-eski', 'Ucuz Eski Fiyat', 100, 50);
        raise exception 'BAŞARISIZ: eski fiyat yeni fiyattan düşük kabul edildi';
    exception when check_violation then null;
    end;
    insert into public.products (slug, category_id, name, price, stock) values ('gecerli-urun', v_cat, 'Geçerli Ürün', 12500, 3);
    if (select is_active from public.products where slug = 'gecerli-urun') then
        raise exception 'BAŞARISIZ: yeni ürün varsayılan olarak yayında';
    end if;
end;
$$;

-- 3) Favori aynı ürüne iki kez eklenemez; kullanıcı silinince favorileri de silinir.
do $$
declare
    v_user uuid := gen_random_uuid();
    v_product uuid;
begin
    insert into auth.users (id, email, raw_user_meta_data) values (v_user, 'favori@test.invalid', '{"full_name":"Favori Kişi","kvkk":"true"}');
    select id into v_product from public.products where slug = 'gecerli-urun';
    insert into public.favorites (user_id, product_id) values (v_user, v_product);
    begin
        insert into public.favorites (user_id, product_id) values (v_user, v_product);
        raise exception 'BAŞARISIZ: aynı favori iki kez eklendi';
    exception when unique_violation then null;
    end;
    delete from auth.users where id = v_user;
    if exists (select 1 from public.favorites where user_id = v_user) then
        raise exception 'BAŞARISIZ: silinen kullanıcının favorileri kaldı';
    end if;
end;
$$;

-- 4) Ayarlar varsayılanlarla gelir; bilinmeyen anahtar eklenemez.
do $$
begin
    if (select count(*) from public.settings) <> 4 then
        raise exception 'BAŞARISIZ: varsayılan ayarlar eksik';
    end if;
    begin
        insert into public.settings (key, value) values ('bilinmeyen', '{}');
        raise exception 'BAŞARISIZ: bilinmeyen ayar anahtarı kabul edildi';
    exception when check_violation then null;
    end;
end;
$$;

do $$ begin raise notice '0002 testleri geçti'; end; $$;
rollback;
