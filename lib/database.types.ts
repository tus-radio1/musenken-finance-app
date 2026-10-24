
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "accounting_groups": {
                  Row: {
                    "created_at": string | null,"id": string,"is_active": boolean,"name": string,"type": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"type"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"type"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"changed_at": string,"changed_by": string | null,"id": string,"new_data": Json | null,"old_data": Json | null,"record_id": string,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"changed_at"?: string,"changed_by"?: string | null,"id"?: string,"new_data"?: Json | null,"old_data"?: Json | null,"record_id": string,"table_name": string
                  }
                  Update: {
                    "action"?: string,"changed_at"?: string,"changed_by"?: string | null,"id"?: string,"new_data"?: Json | null,"old_data"?: Json | null,"record_id"?: string,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"budgets": {
                  Row: {
                    "accounting_group_id": string,"amount": number,"carryover_amount": number,"created_at": string | null,"fiscal_year_id": number,"id": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accounting_group_id": string,"amount"?: number,"carryover_amount"?: number,"created_at"?: string | null,"fiscal_year_id": number,"id"?: string,"updated_at"?: string | null
                  }
                  Update: {
                    "accounting_group_id"?: string,"amount"?: number,"carryover_amount"?: number,"created_at"?: string | null,"fiscal_year_id"?: number,"id"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "budgets_accounting_group_id_fkey"
      columns: ["accounting_group_id"]
isOneToOne: false
      referencedRelation: "accounting_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budgets_fiscal_year_id_fkey"
      columns: ["fiscal_year_id"]
isOneToOne: false
      referencedRelation: "fiscal_years"
      referencedColumns: ["year"]
    }
                  ]
                },"financial_accounts": {
                  Row: {
                    "created_at": string,"display_order": number,"id": string,"is_active": boolean,"name": string,"type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_order"?: number,"id"?: string,"is_active"?: boolean,"name": string,"type": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_order"?: number,"id"?: string,"is_active"?: boolean,"name"?: string,"type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"fiscal_years": {
                  Row: {
                    "created_at": string | null,"end_date": string,"is_current": boolean | null,"start_date": string,"updated_at": string | null,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"end_date": string,"is_current"?: boolean | null,"start_date": string,"updated_at"?: string | null,"year": number
                  }
                  Update: {
                    "created_at"?: string | null,"end_date"?: string,"is_current"?: boolean | null,"start_date"?: string,"updated_at"?: string | null,"year"?: number
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string | null,"deleted_at": string | null,"grade": number | null,"id": string,"name": string,"student_number": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"deleted_at"?: string | null,"grade"?: number | null,"id": string,"name": string,"student_number"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string | null,"deleted_at"?: string | null,"grade"?: number | null,"id"?: string,"name"?: string,"student_number"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"rate_limit_hits": {
                  Row: {
                    "bucket": string,"count": number,"key_hash": string,"reset_at": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket": string,"count": number,"key_hash": string,"reset_at": string,"window_start": string
                  }
                  Update: {
                    "bucket"?: string,"count"?: number,"key_hash"?: string,"reset_at"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"roles": {
                  Row: {
                    "accounting_group_id": string | null,"created_at": string | null,"id": string,"name": string,"type": string,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accounting_group_id"?: string | null,"created_at"?: string | null,"id"?: string,"name": string,"type": string,"updated_at"?: string | null
                  }
                  Update: {
                    "accounting_group_id"?: string | null,"created_at"?: string | null,"id"?: string,"name"?: string,"type"?: string,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_accounting_group_id_fkey"
      columns: ["accounting_group_id"]
isOneToOne: false
      referencedRelation: "accounting_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"subsidy_items": {
                  Row: {
                    "accounting_group_id": string,"actual_amount": number | null,"applicant_id": string,"approved_amount": number | null,"category": Database["public"]['Enums']["subsidy_category"],"created_at": string | null,"date": string,"deleted_at": string | null,"evidence_url": string | null,"expense_type": Database["public"]['Enums']["subsidy_expense_type"],"fiscal_year_id": number,"id": string,"income_type": Database["public"]['Enums']["income_type"],"justification": string | null,"name": string,"receipt_date": string | null,"receipt_url": string | null,"remarks": string | null,"requested_amount": number,"status": Database["public"]['Enums']["subsidy_status"],"term": number,"updated_at": string | null,"usage_period": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accounting_group_id": string,"actual_amount"?: number | null,"applicant_id": string,"approved_amount"?: number | null,"category": Database["public"]['Enums']["subsidy_category"],"created_at"?: string | null,"date"?: string,"deleted_at"?: string | null,"evidence_url"?: string | null,"expense_type": Database["public"]['Enums']["subsidy_expense_type"],"fiscal_year_id": number,"id"?: string,"income_type"?: Database["public"]['Enums']["income_type"],"justification"?: string | null,"name": string,"receipt_date"?: string | null,"receipt_url"?: string | null,"remarks"?: string | null,"requested_amount": number,"status"?: Database["public"]['Enums']["subsidy_status"],"term"?: number,"updated_at"?: string | null,"usage_period"?: string | null
                  }
                  Update: {
                    "accounting_group_id"?: string,"actual_amount"?: number | null,"applicant_id"?: string,"approved_amount"?: number | null,"category"?: Database["public"]['Enums']["subsidy_category"],"created_at"?: string | null,"date"?: string,"deleted_at"?: string | null,"evidence_url"?: string | null,"expense_type"?: Database["public"]['Enums']["subsidy_expense_type"],"fiscal_year_id"?: number,"id"?: string,"income_type"?: Database["public"]['Enums']["income_type"],"justification"?: string | null,"name"?: string,"receipt_date"?: string | null,"receipt_url"?: string | null,"remarks"?: string | null,"requested_amount"?: number,"status"?: Database["public"]['Enums']["subsidy_status"],"term"?: number,"updated_at"?: string | null,"usage_period"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "subsidy_items_accounting_group_id_fkey"
      columns: ["accounting_group_id"]
isOneToOne: false
      referencedRelation: "accounting_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subsidy_items_applicant_id_fkey"
      columns: ["applicant_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subsidy_items_fiscal_year_id_fkey"
      columns: ["fiscal_year_id"]
isOneToOne: false
      referencedRelation: "fiscal_years"
      referencedColumns: ["year"]
    }
                  ]
                },"system_config": {
                  Row: {
                    "description": string | null,"key": string,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"key": string,"value": string
                  }
                  Update: {
                    "description"?: string | null,"key"?: string,"value"?: string
                  }
                  Relationships: [
                    
                  ]
                },"transactions": {
                  Row: {
                    "accounting_group_id": string,"amount": number,"approval_status": Database["public"]['Enums']["approval_status"],"approved_at": string | null,"approved_by": string | null,"created_at": string | null,"created_by": string | null,"date": string,"deleted_at": string | null,"description": string,"financial_account_id": string,"fiscal_year_id": number | null,"id": string,"receipt_url": string | null,"rejected_reason": string | null,"remarks": string | null,"subsidy_item_id": string | null,"transaction_kind": string,"transfer_id": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accounting_group_id": string,"amount": number,"approval_status"?: Database["public"]['Enums']["approval_status"],"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"date": string,"deleted_at"?: string | null,"description": string,"financial_account_id": string,"fiscal_year_id"?: number | null,"id"?: string,"receipt_url"?: string | null,"rejected_reason"?: string | null,"remarks"?: string | null,"subsidy_item_id"?: string | null,"transaction_kind": string,"transfer_id"?: string | null,"updated_at"?: string | null
                  }
                  Update: {
                    "accounting_group_id"?: string,"amount"?: number,"approval_status"?: Database["public"]['Enums']["approval_status"],"approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string | null,"created_by"?: string | null,"date"?: string,"deleted_at"?: string | null,"description"?: string,"financial_account_id"?: string,"fiscal_year_id"?: number | null,"id"?: string,"receipt_url"?: string | null,"rejected_reason"?: string | null,"remarks"?: string | null,"subsidy_item_id"?: string | null,"transaction_kind"?: string,"transfer_id"?: string | null,"updated_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_accounting_group_id_fkey"
      columns: ["accounting_group_id"]
isOneToOne: false
      referencedRelation: "accounting_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_financial_account_id_fkey"
      columns: ["financial_account_id"]
isOneToOne: false
      referencedRelation: "financial_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_fiscal_year_id_fkey"
      columns: ["fiscal_year_id"]
isOneToOne: false
      referencedRelation: "fiscal_years"
      referencedColumns: ["year"]
    },{
      foreignKeyName: "transactions_subsidy_item_id_fkey"
      columns: ["subsidy_item_id"]
isOneToOne: false
      referencedRelation: "subsidy_items"
      referencedColumns: ["id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "created_at": string | null,"id": string,"role_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"role_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"role_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_roles_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_roles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_ledger_transactions": {
                  Row: {
                    "accounting_group_id": string | null,"amount": number | null,"approval_status": Database["public"]['Enums']["approval_status"] | null,"approved_by": string | null,"approved_by_name": string | null,"created_by": string | null,"created_by_name": string | null,"date": string | null,"description": string | null,"financial_account_id": string | null,"financial_account_name": string | null,"fiscal_year_id": number | null,"id": string | null,"receipt_url": string | null,"rejected_reason": string | null,"remarks": string | null,"subsidy_item_id": string | null,"transaction_kind": string | null,"transfer_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "transactions_accounting_group_id_fkey"
      columns: ["accounting_group_id"]
isOneToOne: false
      referencedRelation: "accounting_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_financial_account_id_fkey"
      columns: ["financial_account_id"]
isOneToOne: false
      referencedRelation: "financial_accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_fiscal_year_id_fkey"
      columns: ["fiscal_year_id"]
isOneToOne: false
      referencedRelation: "fiscal_years"
      referencedColumns: ["year"]
    },{
      foreignKeyName: "transactions_subsidy_item_id_fkey"
      columns: ["subsidy_item_id"]
isOneToOne: false
      referencedRelation: "subsidy_items"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "can_file_into_group":
{ Args: { "p_group_id": string }; Returns: boolean
                           },
"can_view_club_ledger":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"create_transfer":
{ Args: { "p_amount": number,"p_created_by"?: string,"p_date": string,"p_description": string,"p_from_account_id": string,"p_receipt_url"?: string,"p_remarks"?: string,"p_to_account_id": string }; Returns: string
                           },
"get_budget_usage":
{ Args: { "p_fiscal_year_id": number }; Returns: {
              "accounting_group_id": string,"expenses": number,"income": number,"pending": number
            }[]
                           },
"has_role":
{ Args: { "role_name": string }; Returns: boolean
                           },
"is_accounting_or_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_club_group":
{ Args: { "p_accounting_group_id": string }; Returns: boolean
                           },
"is_receipt_path_owned_by_caller":
{ Args: { "p_path": string }; Returns: boolean
                           },
"is_restricted_api_writer":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"rate_limit_hit":
{ Args: { "p_bucket": string,"p_key": string,"p_max": number,"p_window_seconds": number }; Returns: {
              "allowed": boolean,"remaining": number,"reset_at": string
            }[]
                           },
"soft_delete_subsidy_item":
{ Args: { "p_id": string }; Returns: string
                           }
          }
          Enums: {
            "approval_status": "pending"|"accepted"|"approved"|"rejected"|"receipt_received"|"refunded"|"received","income_type": "income"|"expense","subsidy_category": "activity"|"league"|"special","subsidy_expense_type": "facility"|"participation"|"equipment"|"registration"|"travel"|"accommodation"|"other"|"tournament"|"expensive_goods","subsidy_status": "pending"|"approved"|"rejected"|"paid"|"receipt_submitted"|"receipt_received"|"unexecuted"|"application_rejected"|"accounting_received"|"application_in_progress"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "approval_status": ["pending", "accepted", "approved", "rejected", "receipt_received", "refunded", "received"],"income_type": ["income", "expense"],"subsidy_category": ["activity", "league", "special"],"subsidy_expense_type": ["facility", "participation", "equipment", "registration", "travel", "accommodation", "other", "tournament", "expensive_goods"],"subsidy_status": ["pending", "approved", "rejected", "paid", "receipt_submitted", "receipt_received", "unexecuted", "application_rejected", "accounting_received", "application_in_progress"]
          }
        }
} as const
