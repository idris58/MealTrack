// client/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
  },
});

// Database types
export interface Database {
  public: {
    Tables: {
      members: {
        Row: {
          id: string;
          name: string;
          avatar: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          avatar?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          avatar?: string | null;
        };
      };
      expenses: {
        Row: {
          id: string;
          amount: number;
          description: string;
          type: 'meal' | 'utility';
          paid_by: string;
          date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          amount: number;
          description: string;
          type: 'meal' | 'utility';
          paid_by: string;
          date?: string;
        };
      };
      meal_logs: {
        Row: {
          id: string;
          member_id: string;
          date: string;
          count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          date: string;
          count: number;
        };
        Update: {
          count?: number;
        };
      };
    };
  };
}
