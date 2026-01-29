# Fly Future Champions — Vercel + Admin + Paiements

Ce projet est un site statique (HTML) + des fonctions serverless Vercel (/api) pour :
- Inscriptions Détections -> Supabase
- Admin en temps réel -> Supabase Realtime
- Export PDF -> /api/export-pdf
- Paiements -> Stripe Checkout (CB + Apple Pay) + PayPal

## 1) Supabase (obligatoire)
Crée un projet Supabase puis exécute ce SQL dans l'onglet SQL editor :

```sql
create table if not exists public.detection_registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  detection_date date not null,
  first_name text not null,
  last_name text not null,
  birth_year int,
  gender text,
  email text,
  phone text,
  city text,
  level text,
  position text,
  height_cm int,
  notes text
);

create index if not exists detection_registrations_date_idx
  on public.detection_registrations (detection_date, created_at desc);

-- settings table for Stripe Connect account id etc.
create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- Enable realtime for the registrations table (Database -> Replication -> add table)
```

### RLS
Pour simplifier, les inserts/reads passent par les fonctions Vercel avec la SERVICE_ROLE_KEY.
L'admin lit en temps réel via l'ANON_KEY : il faut permettre la lecture uniquement aux utilisateurs authentifiés.

Active RLS puis ajoute :

```sql
alter table public.detection_registrations enable row level security;

create policy "Authenticated can read" on public.detection_registrations
for select to authenticated
using (true);
```

Les insertions se font via /api/register-detection (service role).

## 2) Variables d'environnement (Vercel)
Copie `.env.example` dans Vercel -> Project Settings -> Environment Variables.

## 3) Déploiement
- Importer ce repo dans Vercel
- Déployer
- Ouvrir `/admin.html` pour gérer les inscrits + export PDF + paiements.

## 4) Paiements
- Stripe Checkout = CB + Apple Pay (Apple Pay apparaît si activé dans Stripe).
- PayPal via endpoints /api/paypal-create-order et /api/paypal-capture-order.
