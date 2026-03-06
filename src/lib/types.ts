export interface Project {
  id: string;
  name: string;
  is_pinned: boolean;
  export_title?: string | null;
  export_subtitle?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  updated_by?: string | null;
}

export interface ExpertCall {
  id: string;
  project_id: string;
  expert_name: string;
  position?: string | null;
  call_date: string;
  raw_notes: string;
  transcript: string | null;
  formatted_output: string | null;
  docx_blob: string | null;
  sort_order: number;
  entry_type: "auto-generated" | "manual";
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SectionDivider {
  id: string;
  project_id: string;
  label: string;
  sort_order: number;
  created_at: string;
}

export interface TrackerFile {
  id: string;
  project_id: string;
  filename: string;
  file_data: string; // base64 encoded
  sheet_summary: { name: string; expertCount: number }[] | null;
  last_updated: string | null;
  uploaded_at: string;
  updated_at: string;
}

export interface MergeLog {
  timestamp: string;
  networksProcessed: string[];
  changes: {
    added: { name: string; sheet: string; network: string }[];
    networkUpdated: { name: string; sheet: string; network: string }[];
    creditsUpdated: {
      name: string;
      sheet: string;
      oldValue: string;
      newValue: string;
    }[];
  };
}

export type ProjectItem =
  | { type: "call"; data: ExpertCall }
  | { type: "divider"; data: SectionDivider };
