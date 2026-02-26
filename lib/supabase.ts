import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Placement = {
  id: string;
  name: string;
  x: number;
  y: number;
  created_at: string;
};

export type AppState = {
  id: number;
  revealed: boolean;
};
