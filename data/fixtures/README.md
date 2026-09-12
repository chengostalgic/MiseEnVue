# Intake fixtures

Schema-accurate files for testing upload and brief flows. Headers match `backend/spec/architecture.md` §8.

## Ember & Rye (`ember-and-rye/`)

Last 30 days for the seeded Houston demo. Item names match `seed.sql`.

- `menu.csv` — 12 dishes
- `sales-30d.csv` — weekday/weekend lunch and dinner rows, plus two unmatched typos (`Wingz`, `Matcha Ltte`)
- `inventory.csv` — current counts. Chili flakes are absent on purpose.

## Night Owl Noodles (`night-owl-noodles/`)

The 3-minute-brief tenant. No sales file — weekly guesses stay in `brief.json`.

Sign in after `supabase db reset` as `owner3@miseenvue.test` / `password123`.
