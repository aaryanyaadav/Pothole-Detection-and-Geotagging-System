# Supabase Setup Guide

This guide walks you through connecting the Project to Supabase — your cloud database and image storage layer.

> **Skipping this?** No problem. The app automatically enters **Local Fallback Mode**, storing images in the `captures/` directory and using in-memory databases. Supabase is only needed for multi-device access, persistent storage, and the full map dashboard experience.

---

## What You'll Set Up

| Step | What | Why |
|------|------|-----|
| 1 | Create a Supabase project | Your cloud backend |
| 2 | Configure environment variables | Connect app → Supabase |
| 3 | Create PostgreSQL tables | Store users & pothole records |
| 4 | Create a Storage bucket | Store annotated images |
| 5 | Test the integration | Verify everything works |

---

## Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in or create a free account.
2. Click **New Project**, select your organization, and pick a **region closest to your users** (reduces latency).
3. Set a strong **Database Password** and save it somewhere safe.
4. Wait **1–2 minutes** for the database to provision — you'll see a green "Project is ready" indicator.

---

## Step 2 — Configure Environment Variables

Once your project is ready, grab your API keys and link them to the app.

### Where to find your keys

1. In the Supabase Dashboard, go to **Project Settings** (gear icon) → **API**.
2. You'll find three values you need:

| Key | Location | Used By |
|-----|----------|---------|
| `Project URL` | API Settings → Project URL | Backend + Frontend |
| `anon / public key` | API Settings → Project API Keys | Frontend only |
| `service_role key` | API Settings → Project API Keys | Backend only |

>  **Keep your `service_role` key secret.** It bypasses Row Level Security. Never expose it in frontend code or commit it to GitHub.

---

### Create your environment files

####  Backend — `.env` (root directory)

```env
SUPABASE_URL=YOUR_PROJECT_URL_HERE
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY_HERE
```

####  Frontend — `.env.local` (inside `frontend/` directory)

```env
VITE_SUPABASE_URL=YOUR_PROJECT_URL_HERE
VITE_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY_HERE
```

---

## Step 3 — Create PostgreSQL Tables

The app needs two tables: `users` (authentication & profiles) and `potholes` (detection records).

1. In the Supabase Dashboard, click **SQL Editor** in the left sidebar.
2. Click **New Query** and paste the full script below.
3. Click **Run** (or press `Cmd/Ctrl + Enter`).

```sql
-- TABLE 1: users
-- Stores registered user accounts and profile information
CREATE TABLE users (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT        UNIQUE NOT NULL,
  name         TEXT        NOT NULL,
  password_hash TEXT       NOT NULL,
  created_at   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- Row Level Security: users can only read their own data
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
  ON users FOR SELECT
  USING (auth.uid()::text = id::text);

-- Auto-update the 'updated_at' timestamp on every row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- TABLE 2: potholes
-- Stores each pothole detection event with GPS + image data

CREATE TABLE potholes (
  id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email  TEXT,
  image_path  TEXT,
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  accuracy    DOUBLE PRECISION,
  confidence  DOUBLE PRECISION,
  created_at  TIMESTAMP         DEFAULT CURRENT_TIMESTAMP
);

-- Row Level Security: anyone can read, authenticated users can insert
ALTER TABLE potholes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access"
  ON potholes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert"
  ON potholes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');
```

After running, confirm success by clicking **Table Editor** in the sidebar — you should see both `users` and `potholes` tables listed.

---

## Step 4 — Create the Storage Bucket

The backend uploads annotated pothole images here. **Skipping this step will cause all cloud image uploads to fail silently.**

### Create the bucket

1. In the Supabase Dashboard, click **Storage** in the left sidebar.
2. Click **New Bucket**.
3. Set the name to exactly: **`potholes`** (lowercase, no spaces).
4. Toggle **"Public bucket" → ON** — this lets the Leaflet map render images without complex signed URL handling.
5. Click **Save**.

### Set storage access policies

Even with a public bucket, Supabase requires explicit write permissions.

1. Inside the `potholes` bucket, click **Policies** in the left sidebar under Configuration.
2. Click **New Policy** → **For Full Customization**.
3. Fill in the policy as follows:

| Field | Value |
|-------|-------|
| Policy name | `Allow all operations` |
| Allowed operations | `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| Target roles | `anon`, `authenticated` |

4. Click **Save**.

>  **Production note:** For a live deployment, restrict this policy to authenticated users only and scope `DELETE` to the file owner.

---

## Step 5 — Test the Integration

Everything is configured. Let's verify it works end-to-end.

**1. Start the FastAPI backend:**
```bash
python app.py
```

**2. Start the frontend server:**
```bash
python -m http.server 8000
```

**3. Open the app and register:**

Navigate to `http://localhost:8000/frontend/auth.html` and create a test account.

**4. Verify in Supabase:**

Go to **Table Editor → users** in your Supabase Dashboard. You should see a new row with your test account's email and name — confirming the full connection is working. 🎉

---

##  Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| `Invalid API key` error | Wrong key in `.env` | Double-check `service_role` vs `anon` key usage |
| Images not appearing on map | Storage bucket is private | Enable "Public bucket" toggle in Storage settings |
| `relation "users" does not exist` | SQL script wasn't run | Re-run the SQL script from Step 3 |
| Detections not saving | Missing storage policy | Re-check Step 4 access policies |
| App works locally but not on another device | `.env` not configured on that machine | Set env variables on the deployment environment |


