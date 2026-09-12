# MiseEnVue auth test

A small Next.js page for testing Supabase email/password signup, login,
session persistence, and logout.

## Local setup

Start Supabase and print its local credentials:

```bash
cd backend
supabase start
supabase status
```

In another terminal:

```bash
cd frontend
cp .env.local.example .env.local
# Put the anon/publishable key printed by `supabase status` into .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Never place a Supabase
service-role key in a `NEXT_PUBLIC_` variable.
