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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounting_groups: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          type: Database["public"]["Enums"]["accounting_group_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          type: Database["public"]["Enums"]["accounting_group_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          type?: Database["public"]["Enums"]["accounting_group_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      budgets: {
        Row: {
          accounting_group_id: string
          amount: number
          created_at: string | null
          fiscal_year_id: number
          id: string
          updated_at: string | null
        }
        Insert: {
          accounting_group_id: string
          amount?: number
          created_at?: string | null
          fiscal_year_id: number
          id?: string
          updated_at?: string | null
        }
        Update: {
          accounting_group_id?: string
          amount?: number
          created_at?: string | null
          fiscal_year_id?: number
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budgets_accounting_group_id_fkey"
            columns: ["accounting_group_id"]
            isOneToOne: false
            referencedRelation: "accounting_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["year"]
          },
        ]
      }
      fiscal_years: {
        Row: {
          created_at: string | null
          end_date: string
          is_current: boolean | null
          start_date: string
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          end_date: string
          is_current?: boolean | null
          start_date: string
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          end_date?: string
          is_current?: boolean | null
          start_date?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          grade: number | null
          id: string
          name: string
          student_number: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          grade?: number | null
          id: string
          name: string
          student_number?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          grade?: number | null
          id?: string
          name?: string
          student_number?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          accounting_group_id: string | null
          created_at: string | null
          id: string
          name: string
          type: Database["public"]["Enums"]["role_type"]
          updated_at: string | null
        }
        Insert: {
          accounting_group_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          type?: Database["public"]["Enums"]["role_type"]
          updated_at?: string | null
        }
        Update: {
          accounting_group_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["role_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_accounting_group_id_fkey"
            columns: ["accounting_group_id"]
            isOneToOne: false
            referencedRelation: "accounting_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      subsidy_items: {
        Row: {
          accounting_group_id: string
          actual_amount: number | null
          applicant_id: string
          approved_amount: number | null
          category: Database["public"]["Enums"]["subsidy_category"]
          created_at: string | null
          evidence_url: string | null
          expense_type: Database["public"]["Enums"]["subsidy_expense_type"]
          fiscal_year_id: number
          id: string
          justification: string | null
          name: string
          receipt_date: string | null
          receipt_url: string | null
          remarks: string | null
          requested_amount: number
          status: Database["public"]["Enums"]["subsidy_status"]
          term: number
          updated_at: string | null
        }
        Insert: {
          accounting_group_id: string
          actual_amount?: number | null
          applicant_id: string
          approved_amount?: number | null
          category: Database["public"]["Enums"]["subsidy_category"]
          created_at?: string | null
          evidence_url?: string | null
          expense_type: Database["public"]["Enums"]["subsidy_expense_type"]
          fiscal_year_id: number
          id?: string
          justification?: string | null
          name: string
          receipt_date?: string | null
          receipt_url?: string | null
          remarks?: string | null
          requested_amount: number
          status?: Database["public"]["Enums"]["subsidy_status"]
          term: number
          updated_at?: string | null
        }
        Update: {
          accounting_group_id?: string
          actual_amount?: number | null
          applicant_id?: string
          approved_amount?: number | null
          category?: Database["public"]["Enums"]["subsidy_category"]
          created_at?: string | null
          evidence_url?: string | null
          expense_type?: Database["public"]["Enums"]["subsidy_expense_type"]
          fiscal_year_id?: number
          id?: string
          justification?: string | null
          name?: string
          receipt_date?: string | null
          receipt_url?: string | null
          remarks?: string | null
          requested_amount?: number
          status?: Database["public"]["Enums"]["subsidy_status"]
          term?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subsidy_items_accounting_group_id_fkey"
            columns: ["accounting_group_id"]
            isOneToOne: false
            referencedRelation: "accounting_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsidy_items_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subsidy_items_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["year"]
          },
        ]
      }
      transactions: {
        Row: {
          accounting_group_id: string
          amount: number
          approval_status: Database["public"]["Enums"]["transaction_approval_status"]
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string
          date: string
          description: string
          fiscal_year_id: number
          id: string
          receipt_url: string | null
          rejected_reason: string | null
          remarks: string | null
          subsidy_item_id: string | null
          updated_at: string | null
        }
        Insert: {
          accounting_group_id: string
          amount: number
          approval_status?: Database["public"]["Enums"]["transaction_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by: string
          date: string
          description: string
          fiscal_year_id: number
          id?: string
          receipt_url?: string | null
          rejected_reason?: string | null
          remarks?: string | null
          subsidy_item_id?: string | null
          updated_at?: string | null
        }
        Update: {
          accounting_group_id?: string
          amount?: number
          approval_status?: Database["public"]["Enums"]["transaction_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string
          date?: string
          description?: string
          fiscal_year_id?: number
          id?: string
          receipt_url?: string | null
          rejected_reason?: string | null
          remarks?: string | null
          subsidy_item_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_accounting_group_id_fkey"
            columns: ["accounting_group_id"]
            isOneToOne: false
            referencedRelation: "accounting_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["year"]
          },
          {
            foreignKeyName: "transactions_subsidy_item_id_fkey"
            columns: ["subsidy_item_id"]
            isOneToOne: false
            referencedRelation: "subsidy_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_is_admin: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_executive: { Args: never; Returns: boolean }
      is_general_officer: { Args: never; Returns: boolean }
      is_leader_of: { Args: { _group_id: string }; Returns: boolean }
      is_member_of: { Args: { _group_id: string }; Returns: boolean }
    }
    Enums: {
      accounting_group_type: "team" | "general"
      role_type: "general" | "leader" | "admin"
      subsidy_category: "activity" | "league" | "special"
      subsidy_expense_type:
        | "facility"
        | "participation"
        | "equipment"
        | "registration"
        | "travel"
        | "accommodation"
        | "other"
      subsidy_status:
        | "pending"
        | "approved"
        | "rejected"
        | "accounting_received"
        | "paid"
        | "receipt_submitted"
        | "receipt_received"
        | "unexecuted"
        | "application_rejected"
      transaction_approval_status:
        | "pending"
        | "checking"
        | "receipt_received"
        | "approved"
        | "rejected"
        | "accepted"
        | "refunded"
        | "received"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      accounting_group_type: ["team", "general"],
      role_type: ["general", "leader", "admin"],
      subsidy_category: ["activity", "league", "special"],
      subsidy_expense_type: [
        "facility",
        "participation",
        "equipment",
        "registration",
        "travel",
        "accommodation",
        "other",
      ],
      subsidy_status: [
        "pending",
        "approved",
        "rejected",
        "accounting_received",
        "paid",
        "receipt_submitted",
        "receipt_received",
        "unexecuted",
        "application_rejected",
      ],
      transaction_approval_status: [
        "pending",
        "checking",
        "receipt_received",
        "approved",
        "rejected",
        "accepted",
        "refunded",
        "received",
      ],
    },
  },
} as const
