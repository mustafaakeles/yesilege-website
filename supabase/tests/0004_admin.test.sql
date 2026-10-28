-- 0004 migration testleri. Tüm değişiklikler geri alınır; başarı "0004 testleri geçti" bildirimiyle görünür.
begin;

-- 1) İstemci rolleri yönetim fonksiyonlarını çalıştıramaz
do $$
declare
    r text;
begin
    foreach r in array array['anon', 'authenticated'] loop
        execute format('set local role %I', r);
        begin
            perform * from public.admin_find_user('x@test.invalid');
            raise exception 'BAŞARISIZ: % admin_find_user çalıştırdı', r;
        exception when insufficient_privilege then null;
        end;
        begin
            perform public.admin_dashboard();
            raise exception 'BAŞARISIZ: % admin_dashboard çalıştırdı', r;
        exception when insufficient_privilege then null;
        end;
        reset role;
    end loop;
end;
$$;

-- 2) E-posta araması büyük/küçük harf ve boşluk duyarsızdır; özet ve kapasite güncellemesi çalışır
do $$
declare
    v_user uuid := gen_random_uuid();
    v_found uuid;
    v_summary jsonb;
begin
    insert into auth.users (id, email, raw_user_meta_data) values (v_user, 'yonetim@test.invalid', '{"full_name":"Yönetim Test","kvkk":"true"}');
    select id into v_found from public.admin_find_user('  YONETIM@test.invalid ');
    if v_found is distinct from v_user then
        raise exception 'BAŞARISIZ: kullanıcı e-postayla bulunamadı';
    end if;
    v_summary := public.admin_dashboard();
    if v_summary -> 'next_ship_date' is null or extract(isodow from (v_summary ->> 'next_ship_date')::date) <> 6 then
        raise exception 'BAŞARISIZ: özet kargo günü';
    end if;
    insert into public.shipping_batches (ship_date, capacity, reserved) values (public.first_ship_date(), 10, 4);
    perform public.admin_set_weekly_capacity(2);
    if (select capacity from public.shipping_batches where ship_date = public.first_ship_date()) <> 4 then
        raise exception 'BAŞARISIZ: kapasite ayrılmış siparişlerin altına indi';
    end if;
end;
$$;

do $$ begin raise notice '0004 testleri geçti'; end; $$;
rollback;
