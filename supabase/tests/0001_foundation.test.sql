-- 0001 migration testleri. Staging projesinde SQL editöründe çalıştırın; tüm değişiklikler geri alınır.
-- Başarılı çalıştırma "0001 testleri geçti" bildirimi yazar; herhangi bir başarısızlık hata fırlatır.
begin;

-- 1) anon ve authenticated rolleri tablolara erişemez.
do $$
declare
    r text;
    t text;
begin
    foreach r in array array['anon', 'authenticated'] loop
        foreach t in array array['profiles', 'addresses', 'audit_log', 'rate_limits'] loop
            execute format('set local role %I', r);
            begin
                execute format('select count(*) from public.%I', t);
                raise exception 'BAŞARISIZ: % rolü % tablosunu okuyabildi', r, t;
            exception when insufficient_privilege then
                null;
            end;
            begin
                execute format('insert into public.%I default values', t);
                raise exception 'BAŞARISIZ: % rolü % tablosuna yazabildi', r, t;
            exception when insufficient_privilege then
                null;
            end;
            reset role;
        end loop;
        execute format('set local role %I', r);
        begin
            perform public.rate_limit_hit('x', 1, 60);
            raise exception 'BAŞARISIZ: % rolü rate_limit_hit çalıştırabildi', r;
        exception when insufficient_privilege then
            null;
        end;
        reset role;
    end loop;
end;
$$;

-- 2) KVKK onayı olmadan kullanıcı oluşturulamaz; rol meta veriden alınmaz.
do $$
declare
    v_id uuid := gen_random_uuid();
    v_role text;
begin
    begin
        insert into auth.users (id, email, raw_user_meta_data)
        values (gen_random_uuid(), 'kvkksiz@test.invalid', '{"full_name":"Test Kişi"}');
        raise exception 'BAŞARISIZ: KVKK onayı olmadan kayıt oluştu';
    exception when raise_exception then
        if sqlerrm like 'BAŞARISIZ%' then raise; end if;
    end;

    insert into auth.users (id, email, raw_user_meta_data)
    values (v_id, 'rol@test.invalid', '{"full_name":"Test Kişi","kvkk":"true","role":"admin","marketing":"true"}');
    select role into v_role from public.profiles where id = v_id;
    if v_role is distinct from 'customer' then
        raise exception 'BAŞARISIZ: rol meta veriden alındı (%)', v_role;
    end if;
    if not exists (select 1 from public.profiles where id = v_id and marketing_consent and marketing_consent_at is not null) then
        raise exception 'BAŞARISIZ: ticari ileti izni kaydedilmedi';
    end if;
end;
$$;

-- 3) audit_log yalnızca eklemeye açık.
do $$
declare
    v_id bigint;
begin
    insert into public.audit_log (action) values ('test') returning id into v_id;
    begin
        update public.audit_log set action = 'degisti' where id = v_id;
        raise exception 'BAŞARISIZ: audit_log güncellendi';
    exception when raise_exception then
        if sqlerrm like 'BAŞARISIZ%' then raise; end if;
    end;
    begin
        delete from public.audit_log where id = v_id;
        raise exception 'BAŞARISIZ: audit_log silindi';
    exception when raise_exception then
        if sqlerrm like 'BAŞARISIZ%' then raise; end if;
    end;
end;
$$;

-- 4) rate_limit_hit sayacı.
do $$
begin
    if not public.rate_limit_hit('test:sayac', 2, 60) then raise exception 'BAŞARISIZ: 1. istek reddedildi'; end if;
    if not public.rate_limit_hit('test:sayac', 2, 60) then raise exception 'BAŞARISIZ: 2. istek reddedildi'; end if;
    if public.rate_limit_hit('test:sayac', 2, 60) then raise exception 'BAŞARISIZ: 3. istek kabul edildi'; end if;
    update public.rate_limits set reset_at = now() - interval '1 second' where key = 'test:sayac';
    if not public.rate_limit_hit('test:sayac', 2, 60) then raise exception 'BAŞARISIZ: pencere sıfırlanmadı'; end if;
end;
$$;

-- 5) Kullanıcı başına tek varsayılan adres.
do $$
declare
    v_id uuid := gen_random_uuid();
begin
    insert into auth.users (id, email, raw_user_meta_data)
    values (v_id, 'adres@test.invalid', '{"full_name":"Adres Kişi","kvkk":"true"}');
    insert into public.addresses (user_id, title, recipient_name, phone, city, district, neighbourhood, line, is_default)
    values (v_id, 'Ev', 'Adres Kişi', '05320000000', 'İzmir', 'Bayındır', 'Merkez', 'Deneme Sk. 1', true);
    begin
        insert into public.addresses (user_id, title, recipient_name, phone, city, district, neighbourhood, line, is_default)
        values (v_id, 'İş', 'Adres Kişi', '05320000000', 'İzmir', 'Bayındır', 'Merkez', 'Deneme Sk. 2', true);
        raise exception 'BAŞARISIZ: ikinci varsayılan adres eklendi';
    exception when unique_violation then
        null;
    end;
end;
$$;

do $$ begin raise notice '0001 testleri geçti'; end; $$;
rollback;
