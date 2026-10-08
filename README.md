# Veiligheidsrondes

Webapp om per site brandveiligheidsrondes bij te houden: een ronde per datum, met observaties
(gebouw, verdiep, lokaal, onderwerp, omschrijving, foto, gemeld, opgelost).

Sites: Psychiatrisch ziekenhuis Tienen, WZC Sint-Alexius, WZC-Passionisten, WZC-Huize Nazareth, PSC-Leuven en Hestia.

De app is een statische pagina (GitHub Pages). De gegevens staan in een Supabase-database;
collega's melden zich aan met een link die ze per e-mail krijgen.

## Eenmalige opzet

1. **Supabase-project**: maak een gratis account op [supabase.com](https://supabase.com) en een nieuw project
   (regio: Europa, bv. Frankfurt).
2. **Database**: open *SQL Editor*, plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql) en klik *Run*.
3. **Collega's toegang geven**: in de SQL Editor, per e-mailadres (kleine letters):
   ```sql
   insert into public.toegang (email) values ('naam@voorbeeld.be');
   ```
   Wie niet in die lijst staat, kan zich wel aanmelden maar ziet geen gegevens.
4. **Aanmeldlink**: ga naar *Authentication > URL Configuration* en zet *Site URL* en een *Redirect URL*
   op het adres van de app, bv. `https://<gebruiker>.github.io/veiligheidsrondes/`.
5. **Koppelen**: vul in [`config.js`](config.js) de *Project URL* en de *anon public* sleutel in
   (Supabase > *Project Settings > API*).
6. **GitHub Pages**: repository > *Settings > Pages* > *Deploy from a branch* > `main` / `(root)`.

## Opmerkingen

- De gratis aanmeldmails van Supabase zijn beperkt in aantal per uur. Voor een grotere groep stel je
  een eigen mailserver in onder *Authentication > SMTP*.
- Een gratis Supabase-project wordt gepauzeerd na een week zonder gebruik; je zet het terug aan in het dashboard.
