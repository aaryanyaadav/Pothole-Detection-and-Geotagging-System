#  Supabase Setup Guide

This guide will walk you through setting up Supabase, which acts as the core database and cloud storage for the Real-Time Pothole Detection System.

> **Note:** If you skip this setup, the app will automatically enter **Local Fallback Mode**, storing images in the `captures/` dict and using in-memory databases. However, Supabase is recommended for full functionality across devices.

---

## Step 1: Create a Supabase Project
1. Go to [Supabase.com](https://supabase.com) and sign in/sign up.
2. Click **New Project**, select an organization, and choose a region closest to your expected users.
3. Choose a strong Database Password and wait approximately 1-2 minutes for the database to provision.

---

## Step 2: Configure Environment Variables
Once your project is ready, you need to link your application to the new cloud database.

1. On the Supabase Dashboard, navigate to **Project Settings** (the gear icon ⚙️) → **API**.
2. Locate your **Project URL** and your **anon / public key**.
3. Locate your **service_role key** (this is a secret key that bypasses Row Level Security—keep it safe!).
4. Create **two** environment files in your project:

### 1. Backend `.env` (Create in the root directory)
```env
SUPABASE_URL=YOUR_PROJECT_URL_HERE
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY_HERE
```

### 2. Frontend `.env.local` (Create inside the `frontend/` directory)
```env
VITE_SUPABASE_URL=YOUR_PROJECT_URL_HERE
VITE_SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY_HERE
```

---

## Step 3: Create PostgreSQL Tables (SQL Editor)
We need to create the `users` and `potholes` tables. Supabase provides a handy SQL Editor for this.

1. Navigate to the **SQL Editor** tab on the left sidebar.
2. Click **New query** and paste the following SQL script exactly as written:

```sql
-- 1. Create Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS (Row Level Security) for Users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid()::text = id::text);

-- Trigger to auto-update the 'updated_at' column
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

-- 2. Create Potholes Table
CREATE TABLE potholes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT,
  image_path TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  confidence DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS for Potholes
ALTER TABLE potholes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON potholes
  FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert" ON potholes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'anon');
```
3. Click the **Run** button (or press `Cmd/Ctrl + Enter`) to execute the script and build your tables.

---

## Step 4: Create the Object Storage Bucket  (Crucial Step!)
The backend needs a secure place to upload the annotated pothole images. **If you skip this, cloud image uploads will fail.**

1. In the Supabase Dashboard, click on **Storage** in the left sidebar.
2. Click **New Bucket**.
3. Name the bucket exactly: `potholes` (all lowercase).
4. **Make sure the "Public bucket" toggle is checked ON.** (This allows the Leaflet Map to render the images without needing complex signed URLs).
5. Click **Save**.

### Set Storage Access Policies
Even if the bucket is public, Supabase requires you to explicitly allow "Insertions".
1. In the `potholes` bucket view, click on **Policies** (under the Configuration settings on the left).
2. Click **New Policy** under the `potholes` storage bucket.
3. Select "For Full Customization" or "Get started quickly".
4. Add a policy that allows **all actions** (SELECT, INSERT, UPDATE, DELETE) for all users for now:
   - Name: `Allow all operations`
   - Allowed Operations: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
   - Target Roles: `anon`, `authenticated`
   - Click **Save**.

---

## Step 5: Test the Integration
You are now fully configured! Test the integration by spinning up your application block:

1. **Start the FastAPI Backend:**
   ```bash
   python app.py
   ```
2. **Start the Frontend Web Server:**
   ```bash
   python -m http.server 8000
   ```
3. **Verify:**
   Navigate to `http://localhost:8000/frontend/auth.html`. Create a new test account. Check your Supabase Dashboard under **Table Editor -> users**. You should see a brand new row with your test account!
