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
  created_by uuid references auth.users(id) not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  updated_by uuid references auth.users(id) not null
);

-- Enable RLS
alter table projects enable row level security;

-- Policies: authenticated users can read all projects, insert their own, update any
create policy "Authenticated users can view all projects"
  on projects for select
  to authenticated
  using (true);

create policy "Authenticated users can create projects"
  on projects for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Authenticated users can update projects"
  on projects for update
  to authenticated
  using (true);

create policy "Authenticated users can delete their own projects"
  on projects for delete
  to authenticated
  using (auth.uid() = created_by);

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
  created_by uuid references auth.users(id) not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Enable RLS
alter table expert_calls enable row level security;

-- Policies: authenticated users can CRUD expert calls
create policy "Authenticated users can view all expert calls"
  on expert_calls for select
  to authenticated
  using (true);

create policy "Authenticated users can create expert calls"
  on expert_calls for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Authenticated users can update expert calls"
  on expert_calls for update
  to authenticated
  using (true);

create policy "Authenticated users can delete expert calls"
  on expert_calls for delete
  to authenticated
  using (auth.uid() = created_by);

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
