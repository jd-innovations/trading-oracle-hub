export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      auto_trader_settings: {
        Row: {
          cool_off_et: string
          created_at: string
          early_stop_pct: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cool_off_et?: string
          created_at?: string
          early_stop_pct?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cool_off_et?: string
          created_at?: string
          early_stop_pct?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      auto_trader_state: {
        Row: {
          logged_leg_count: number
          plan_date: string
          posted_event_count: number
          state: Json
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          logged_leg_count?: number
          plan_date: string
          posted_event_count?: number
          state: Json
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          logged_leg_count?: number
          plan_date?: string
          posted_event_count?: number
          state?: Json
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_plans: {
        Row: {
          bias: string
          context: string | null
          created_at: string
          id: string
          naked_30m_pocs: Json
          pivot: number
          plan_date: string
          prior_close: number | null
          prior_high: number | null
          prior_low: number | null
          prior_poc: number | null
          prior_vah: number | null
          prior_val: number | null
          published: boolean
          published_at: string
          source: string
          symbol: string
          t1_dn: number
          t1_up: number
          t2_dn: number
          t2_up: number
          t3_dn: number
          t3_up: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bias: string
          context?: string | null
          created_at?: string
          id?: string
          naked_30m_pocs?: Json
          pivot: number
          plan_date: string
          prior_close?: number | null
          prior_high?: number | null
          prior_low?: number | null
          prior_poc?: number | null
          prior_vah?: number | null
          prior_val?: number | null
          published?: boolean
          published_at?: string
          source?: string
          symbol?: string
          t1_dn: number
          t1_up: number
          t2_dn: number
          t2_up: number
          t3_dn: number
          t3_up: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bias?: string
          context?: string | null
          created_at?: string
          id?: string
          naked_30m_pocs?: Json
          pivot?: number
          plan_date?: string
          prior_close?: number | null
          prior_high?: number | null
          prior_low?: number | null
          prior_poc?: number | null
          prior_vah?: number | null
          prior_val?: number | null
          published?: boolean
          published_at?: string
          source?: string
          symbol?: string
          t1_dn?: number
          t1_up?: number
          t2_dn?: number
          t2_up?: number
          t3_dn?: number
          t3_up?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          bias: string | null
          contracts: number | null
          created_at: string
          entry_label: string | null
          entry_price: number | null
          entry_time: string | null
          exit_label: string | null
          exit_price: number | null
          exit_time: string | null
          id: string
          kind: string
          mae_points: number | null
          mfe_points: number | null
          mfe_time: string | null
          notes: string | null
          phase: string | null
          pivot: number | null
          plan_date: string
          realized_points: number | null
          score: number | null
          session_close: number | null
          session_high: number | null
          session_low: number | null
          side: string | null
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bias?: string | null
          contracts?: number | null
          created_at?: string
          entry_label?: string | null
          entry_price?: number | null
          entry_time?: string | null
          exit_label?: string | null
          exit_price?: number | null
          exit_time?: string | null
          id?: string
          kind: string
          mae_points?: number | null
          mfe_points?: number | null
          mfe_time?: string | null
          notes?: string | null
          phase?: string | null
          pivot?: number | null
          plan_date: string
          realized_points?: number | null
          score?: number | null
          session_close?: number | null
          session_high?: number | null
          session_low?: number | null
          side?: string | null
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bias?: string | null
          contracts?: number | null
          created_at?: string
          entry_label?: string | null
          entry_price?: number | null
          entry_time?: string | null
          exit_label?: string | null
          exit_price?: number | null
          exit_time?: string | null
          id?: string
          kind?: string
          mae_points?: number | null
          mfe_points?: number | null
          mfe_time?: string | null
          notes?: string | null
          phase?: string | null
          pivot?: number | null
          plan_date?: string
          realized_points?: number | null
          score?: number | null
          session_close?: number | null
          session_high?: number | null
          session_low?: number | null
          side?: string | null
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      schwab_oauth_state: {
        Row: {
          code_verifier: string
          created_at: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          redirect_uri?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      schwab_tokens: {
        Row: {
          access_expires_at: string
          access_token: string
          refresh_expires_at: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_expires_at: string
          access_token: string
          refresh_expires_at: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_expires_at?: string
          access_token?: string
          refresh_expires_at?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
