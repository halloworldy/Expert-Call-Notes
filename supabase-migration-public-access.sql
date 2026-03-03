-- ============================================================
-- Migration: Make app publicly accessible (no auth required)
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Drop existing RLS policies on projects
DROP POLICY IF EXISTS "Authenticated users can view all projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can create projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can update projects" ON projects;
DROP POLICY IF EXISTS "Authenticated users can delete their own projects" ON projects;

-- Drop existing RLS policies on expert_calls
DROP POLICY IF EXISTS "Authenticated users can view all expert calls" ON expert_calls;
DROP POLICY IF EXISTS "Authenticated users can create expert calls" ON expert_calls;
DROP POLICY IF EXISTS "Authenticated users can update expert calls" ON expert_calls;
DROP POLICY IF EXISTS "Authenticated users can delete expert calls" ON expert_calls;

-- Drop foreign key constraints on created_by / updated_by
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_created_by_fkey;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_updated_by_fkey;
ALTER TABLE expert_calls DROP CONSTRAINT IF EXISTS expert_calls_created_by_fkey;

-- Make created_by / updated_by nullable and change to text (no longer tied to auth.users)
ALTER TABLE projects ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE projects ALTER COLUMN updated_by DROP NOT NULL;
ALTER TABLE projects ALTER COLUMN created_by TYPE text USING created_by::text;
ALTER TABLE projects ALTER COLUMN updated_by TYPE text USING updated_by::text;

ALTER TABLE expert_calls ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE expert_calls ALTER COLUMN created_by TYPE text USING created_by::text;

-- Disable RLS entirely (public app, no auth)
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE expert_calls DISABLE ROW LEVEL SECURITY;

-- Grant access to the anon role (used by Supabase anon key)
GRANT ALL ON projects TO anon;
GRANT ALL ON expert_calls TO anon;
