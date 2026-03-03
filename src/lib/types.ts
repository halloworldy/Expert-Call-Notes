export interface Project {
  id: string;
  name: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  updated_by?: string | null;
}

export interface ExpertCall {
  id: string;
  project_id: string;
  expert_name: string;
  call_date: string;
  raw_notes: string;
  transcript: string | null;
  formatted_output: string | null;
  docx_blob: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}
