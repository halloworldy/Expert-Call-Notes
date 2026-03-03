-- Migration V3: Add export_title and export_subtitle to projects
-- Run this in Supabase SQL Editor

ALTER TABLE projects ADD COLUMN IF NOT EXISTS export_title TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS export_subtitle TEXT;
