-- Alleen lezen: controleert de beveiliging van de tabellen van deze app. Wijzigt niets.
-- Verwacht: rondes en observaties hebben rls_aan = true en één regel "voor collega's" (authenticated, heeft_toegang());
-- toegang heeft rls_aan = true en GEEN REGELS (niemand kan de lijst via de app lezen of wijzigen).
select c.relname as tabel,
       c.relrowsecurity as rls_aan,
       coalesce(string_agg(p.polname || ' (' || array_to_string(array(select rolname from pg_roles where oid = any(p.polroles)), ',') || '): '
                || pg_get_expr(p.polqual, p.polrelid), E'\n'), 'GEEN REGELS') as regels
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where c.relkind = 'r' and c.relname in ('rondes', 'observaties', 'toegang')
group by c.relname, c.relrowsecurity
order by c.relname;

-- Foto's: verwacht een privé-bucket en vier regels "fotos ..." met heeft_toegang().
select id, public from storage.buckets where id = 'fotos';
select polname, pg_get_expr(polqual, polrelid) as voorwaarde, pg_get_expr(polwithcheck, polrelid) as controle
from pg_policy where polrelid = 'storage.objects'::regclass and polname like 'fotos%';
