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
      account_balances: {
        Row: {
          account_id: string
          balance_minor: number
          currency: Database["public"]["Enums"]["currency_code"]
          debit_limit_minor: number
        }
        Insert: {
          account_id: string
          balance_minor?: number
          currency: Database["public"]["Enums"]["currency_code"]
          debit_limit_minor?: number
        }
        Update: {
          account_id?: string
          balance_minor?: number
          currency?: Database["public"]["Enums"]["currency_code"]
          debit_limit_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_balances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_number: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["account_kind"]
          name: string
          national_id: string | null
          nature: Database["public"]["Enums"]["account_nature"]
          owner_user_id: string | null
          phone: string | null
          status: string
          vault_channel: Database["public"]["Enums"]["vault_channel"] | null
        }
        Insert: {
          account_number?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["account_kind"]
          name: string
          national_id?: string | null
          nature: Database["public"]["Enums"]["account_nature"]
          owner_user_id?: string | null
          phone?: string | null
          status?: string
          vault_channel?: Database["public"]["Enums"]["vault_channel"] | null
        }
        Update: {
          account_number?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["account_kind"]
          name?: string
          national_id?: string | null
          nature?: Database["public"]["Enums"]["account_nature"]
          owner_user_id?: string | null
          phone?: string | null
          status?: string
          vault_channel?: Database["public"]["Enums"]["vault_channel"] | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          details: Json | null
          id: string
          target: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          target?: string | null
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_id: string
          amount_minor: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          side: Database["public"]["Enums"]["entry_side"]
          transaction_id: string
        }
        Insert: {
          account_id: string
          amount_minor: number
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          id?: string
          side: Database["public"]["Enums"]["entry_side"]
          transaction_id: string
        }
        Update: {
          account_id?: string
          amount_minor?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          side?: Database["public"]["Enums"]["entry_side"]
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          browser_push_enabled: boolean
          daily_summary_enabled: boolean
          daily_summary_time: string
          enabled: Json
          large_tx_threshold: Json
          low_vault_threshold: Json
          pending_reminder_minutes: number
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          browser_push_enabled?: boolean
          daily_summary_enabled?: boolean
          daily_summary_time?: string
          enabled?: Json
          large_tx_threshold?: Json
          low_vault_threshold?: Json
          pending_reminder_minutes?: number
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          browser_push_enabled?: boolean
          daily_summary_enabled?: boolean
          daily_summary_time?: string
          enabled?: Json
          large_tx_threshold?: Json
          low_vault_threshold?: Json
          pending_reminder_minutes?: number
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_reminders_state: {
        Row: {
          kind: string
          last_sent_at: string
          user_id: string
        }
        Insert: {
          kind: string
          last_sent_at?: string
          user_id: string
        }
        Update: {
          kind?: string
          last_sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json
          event_type: Database["public"]["Enums"]["notification_event"]
          id: string
          read_at: string | null
          severity: Database["public"]["Enums"]["notification_severity"]
          title: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          data?: Json
          event_type: Database["public"]["Enums"]["notification_event"]
          id?: string
          read_at?: string | null
          severity?: Database["public"]["Enums"]["notification_severity"]
          title: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          event_type?: Database["public"]["Enums"]["notification_event"]
          id?: string
          read_at?: string | null
          severity?: Database["public"]["Enums"]["notification_severity"]
          title?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          label: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          id?: string
          label?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          label?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      transaction_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          id: string
          size_bytes: number | null
          storage_path: string
          transaction_id: string | null
          uploaded_by: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          id?: string
          size_bytes?: number | null
          storage_path: string
          transaction_id?: string | null
          uploaded_by: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          id?: string
          size_bytes?: number | null
          storage_path?: string
          transaction_id?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_minor: number
          approved_by_user_id: string | null
          channel: Database["public"]["Enums"]["vault_channel"]
          comment: string
          created_at: string
          created_by_user_id: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_account_id: string
          direction: Database["public"]["Enums"]["tx_direction"]
          id: string
          posted_at: string | null
          reject_reason: string | null
          status: Database["public"]["Enums"]["tx_status"]
          tx_number: string
          vault_account_id: string | null
        }
        Insert: {
          amount_minor: number
          approved_by_user_id?: string | null
          channel: Database["public"]["Enums"]["vault_channel"]
          comment: string
          created_at?: string
          created_by_user_id: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_account_id: string
          direction: Database["public"]["Enums"]["tx_direction"]
          id?: string
          posted_at?: string | null
          reject_reason?: string | null
          status: Database["public"]["Enums"]["tx_status"]
          tx_number: string
          vault_account_id?: string | null
        }
        Update: {
          amount_minor?: number
          approved_by_user_id?: string | null
          channel?: Database["public"]["Enums"]["vault_channel"]
          comment?: string
          created_at?: string
          created_by_user_id?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_account_id?: string
          direction?: Database["public"]["Enums"]["tx_direction"]
          id?: string
          posted_at?: string | null
          reject_reason?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          tx_number?: string
          vault_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_customer_account_id_fkey"
            columns: ["customer_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_vault_account_id_fkey"
            columns: ["vault_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _notify_role: {
        Args: {
          p_body: string
          p_data: Json
          p_event: Database["public"]["Enums"]["notification_event"]
          p_role: Database["public"]["Enums"]["app_role"]
          p_severity: Database["public"]["Enums"]["notification_severity"]
          p_title: string
          p_tx: string
        }
        Returns: undefined
      }
      _notify_user: {
        Args: {
          p_body: string
          p_data: Json
          p_event: Database["public"]["Enums"]["notification_event"]
          p_severity: Database["public"]["Enums"]["notification_severity"]
          p_title: string
          p_tx: string
          p_user_id: string
        }
        Returns: undefined
      }
      _seed_pending_tx: {
        Args: {
          p_amount: number
          p_channel: Database["public"]["Enums"]["vault_channel"]
          p_comment: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_customer: string
          p_direction: Database["public"]["Enums"]["tx_direction"]
          p_teller: string
          p_vault: string
        }
        Returns: undefined
      }
      _seed_post_tx: {
        Args: {
          p_amount: number
          p_channel: Database["public"]["Enums"]["vault_channel"]
          p_comment: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_customer: string
          p_direction: Database["public"]["Enums"]["tx_direction"]
          p_teller: string
          p_vault: string
        }
        Returns: undefined
      }
      _upsert_customer: {
        Args: { p_name: string; p_owner: string }
        Returns: string
      }
      _upsert_vault: {
        Args: {
          p_ch: Database["public"]["Enums"]["vault_channel"]
          p_cur: Database["public"]["Enums"]["currency_code"]
          p_name: string
          p_start: number
        }
        Returns: string
      }
      approve_transaction: {
        Args: { p_tx_id: string }
        Returns: {
          amount_minor: number
          approved_by_user_id: string | null
          channel: Database["public"]["Enums"]["vault_channel"]
          comment: string
          created_at: string
          created_by_user_id: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_account_id: string
          direction: Database["public"]["Enums"]["tx_direction"]
          id: string
          posted_at: string | null
          reject_reason: string | null
          status: Database["public"]["Enums"]["tx_status"]
          tx_number: string
          vault_account_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      notifications_mark_all_read: { Args: never; Returns: number }
      notifications_mark_read: { Args: { p_ids: string[] }; Returns: number }
      post_transaction: {
        Args: {
          p_amount_minor: number
          p_channel: Database["public"]["Enums"]["vault_channel"]
          p_comment: string
          p_currency: Database["public"]["Enums"]["currency_code"]
          p_customer_account_id: string
          p_direction: Database["public"]["Enums"]["tx_direction"]
        }
        Returns: {
          amount_minor: number
          approved_by_user_id: string | null
          channel: Database["public"]["Enums"]["vault_channel"]
          comment: string
          created_at: string
          created_by_user_id: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_account_id: string
          direction: Database["public"]["Enums"]["tx_direction"]
          id: string
          posted_at: string | null
          reject_reason: string | null
          status: Database["public"]["Enums"]["tx_status"]
          tx_number: string
          vault_account_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_transaction: {
        Args: { p_reason: string; p_tx_id: string }
        Returns: {
          amount_minor: number
          approved_by_user_id: string | null
          channel: Database["public"]["Enums"]["vault_channel"]
          comment: string
          created_at: string
          created_by_user_id: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_account_id: string
          direction: Database["public"]["Enums"]["tx_direction"]
          id: string
          posted_at: string | null
          reject_reason: string | null
          status: Database["public"]["Enums"]["tx_status"]
          tx_number: string
          vault_account_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      run_notification_reminders: { Args: never; Returns: Json }
      seed_demo_ledger: {
        Args: { p_admin_id: string; p_consumer_id: string; p_teller_id: string }
        Returns: Json
      }
    }
    Enums: {
      account_kind: "customer" | "vault"
      account_nature: "credit" | "debit"
      app_role: "admin" | "teller" | "auditor" | "consumer"
      currency_code: "USD" | "EUR" | "LYD"
      entry_side: "debit" | "credit"
      notification_event:
        | "tx_posted"
        | "pending_created"
        | "approval_decision"
        | "large_tx"
        | "low_vault"
        | "overdraft"
        | "daily_summary"
        | "account_change"
        | "reminder_pending"
        | "reminder_shift"
      notification_severity: "info" | "warning" | "critical"
      tx_direction: "deposit" | "withdraw"
      tx_status: "posted" | "pending" | "rejected" | "reversed"
      vault_channel: "cash" | "bank"
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
      account_kind: ["customer", "vault"],
      account_nature: ["credit", "debit"],
      app_role: ["admin", "teller", "auditor", "consumer"],
      currency_code: ["USD", "EUR", "LYD"],
      entry_side: ["debit", "credit"],
      notification_event: [
        "tx_posted",
        "pending_created",
        "approval_decision",
        "large_tx",
        "low_vault",
        "overdraft",
        "daily_summary",
        "account_change",
        "reminder_pending",
        "reminder_shift",
      ],
      notification_severity: ["info", "warning", "critical"],
      tx_direction: ["deposit", "withdraw"],
      tx_status: ["posted", "pending", "rejected", "reversed"],
      vault_channel: ["cash", "bank"],
    },
  },
} as const
