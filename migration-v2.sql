-- Migration V2: Add sort_order, is_pinned, and section_dividers table
-- Run this in Supabase SQL Editor

-- Add sort_order to expert_calls
ALTER TABLE expert_calls ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Backfill sort_order based on call_date for existing rows
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY call_date DESC) - 1 AS rn
  FROM expert_calls
)
UPDATE expert_calls SET sort_order = ranked.rn FROM ranked WHERE expert_calls.id = ranked.id;

-- Add is_pinned to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;

-- Create section_dividers table
CREATE TABLE IF NOT EXISTS section_dividers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL DEFAULT 'Section Divider',
  sort_order integer DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Disable RLS on section_dividers (matching existing tables)
ALTER TABLE section_dividers DISABLE ROW LEVEL SECURITY;

-- Grant anon role access to section_dividers
GRANT ALL ON section_dividers TO anon;
