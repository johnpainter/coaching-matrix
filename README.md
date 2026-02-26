# Coaching Matrix

A real-time multi-user coaching placement app. Participants enter their name and place a dot on a 2×2 colored grid. The coach clicks "Reveal All" to show everyone's placements simultaneously.

---

## Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account and new project.
2. In the **SQL Editor**, run the following schema:

```sql
-- User dot placements (upsert by name)
create table placements (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  x float not null,
  y float not null,
  created_at timestamptz default now()
);

-- Single-row app state
create table app_state (
  id integer primary key default 1,
  revealed boolean default false,
  constraint single_row check (id = 1)
);
insert into app_state (id, revealed) values (1, false);

-- RLS: allow all (small trusted group)
alter table placements enable row level security;
alter table app_state enable row level security;
create policy "allow all" on placements for all using (true) with check (true);
create policy "allow all" on app_state for all using (true) with check (true);

-- Enable realtime
alter publication supabase_realtime add table placements;
alter publication supabase_realtime add table app_state;
```

### 2. Get Your Supabase Credentials

1. In the Supabase dashboard, go to **Project Settings → API**.
2. Copy your **Project URL** and **anon/public** key.

### 3. Configure Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in your values:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Install Dependencies and Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo.
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Click **Deploy**.
5. Share the deployed URL with your participants.

---

## Usage

| Role | Action |
|---|---|
| **Participant** | Enter your name → Click anywhere on the matrix → Submit |
| **Coach** | Click **Reveal All** to show everyone's placements in real-time |
| **Coach** | Click **Reset Session** to clear all placements for a new round |

### Matrix Quadrants (no labels — intentional)
- Top-left: Yellow
- Top-right: Green
- Bottom-left: Red
- Bottom-right: Blue

---

## Verification

Open the app in 3 browser tabs to simulate 3 users:

1. Each tab: enter a different name, click on the matrix, click **Submit My Placement**.
2. In any tab: click **Reveal All** → all 3 dots appear simultaneously across all tabs.
3. Click **Reset Session** → all dots clear across all tabs.
