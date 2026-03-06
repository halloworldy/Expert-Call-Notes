-- Migration V4: Add entry_type, position to expert_calls; add tracker_files table
-- Run this in Supabase SQL Editor

-- Add entry_type column to expert_calls (default 'auto-generated' for existing rows)
ALTER TABLE expert_calls ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'auto-generated';

-- Add position column to expert_calls
ALTER TABLE expert_calls ADD COLUMN IF NOT EXISTS position TEXT;

-- Make raw_notes nullable (manual entries may not have raw notes)
ALTER TABLE expert_calls ALTER COLUMN raw_notes DROP NOT NULL;

-- Create tracker_files table for storing uploaded Excel trackers per project
CREATE TABLE IF NOT EXISTS tracker_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  file_data TEXT NOT NULL,
  sheet_summary JSONB,
  last_updated TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Disable RLS on tracker_files (matching existing tables)
ALTER TABLE tracker_files DISABLE ROW LEVEL SECURITY;

-- Grant anon role access to tracker_files
GRANT ALL ON tracker_files TO anon;

-- Auto-update trigger for tracker_files
CREATE TRIGGER update_tracker_files_updated_at
  BEFORE UPDATE ON tracker_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
