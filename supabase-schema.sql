-- ============================================================
-- Supabase Schema for PE Diligence Note Management
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- Projects table
-- ============================================================
create table if not exists projects (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_by text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  updated_by text
);

-- ============================================================
-- Expert calls table
-- ============================================================
create table if not exists expert_calls (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  expert_name text not null,
  call_date date not null,
  raw_notes text not null,
  transcript text,
  formatted_output text,
  docx_blob text,
  created_by text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================================
-- Grant public access (no auth required)
-- ============================================================
grant all on projects to anon;
grant all on expert_calls to anon;

-- ============================================================
-- Auto-update updated_at timestamp trigger
-- ============================================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_projects_updated_at
  before update on projects
  for each row
  execute function update_updated_at_column();

create trigger update_expert_calls_updated_at
  before update on expert_calls
  for each row
  execute function update_updated_at_column();
