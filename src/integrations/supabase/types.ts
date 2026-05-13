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
      account_group_members: {
        Row: {
          added_at: string
          added_by: string | null
          group_id: number
          holder_account_id: number
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          group_id: number
          holder_account_id: number
        }
        Update: {
          added_at?: string
          added_by?: string | null
          group_id?: number
          holder_account_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "account_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_group_members_holder_account_id_fkey"
            columns: ["holder_account_id"]
            isOneToOne: false
            referencedRelation: "holder_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_group_members_holder_account_id_fkey"
            columns: ["holder_account_id"]
            isOneToOne: false
            referencedRelation: "v_holder_account_withdraw_limits"
            referencedColumns: ["holder_account_id"]
          },
        ]
      }
      account_groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          group_type: string
          id: number
          is_pinned: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          group_type?: string
          id?: number
          is_pinned?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          group_type?: string
          id?: number
          is_pinned?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      account_holders: {
        Row: {
          canonical_name: string
          created_at: string
          dahab_account_number: string
          email: string | null
          holder_type: string
          id: number
          normalized_name: string
          owner_user_id: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          canonical_name: string
          created_at?: string
          dahab_account_number: string
          email?: string | null
          holder_type?: string
          id?: number
          normalized_name: string
          owner_user_id?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          canonical_name?: string
          created_at?: string
          dahab_account_number?: string
          email?: string | null
          holder_type?: string
          id?: number
          normalized_name?: string
          owner_user_id?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      account_import_batches: {
        Row: {
          failed_rows: number
          file_name: string
          id: number
          imported_at: string
          imported_by: string | null
          review_rows: number
          status: string
          successful_rows: number
          total_rows: number
        }
        Insert: {
          failed_rows?: number
          file_name: string
          id?: number
          imported_at?: string
          imported_by?: string | null
          review_rows?: number
          status?: string
          successful_rows?: number
          total_rows?: number
        }
        Update: {
          failed_rows?: number
          file_name?: string
          id?: number
          imported_at?: string
          imported_by?: string | null
          review_rows?: number
          status?: string
          successful_rows?: number
          total_rows?: number
        }
        Relationships: []
      }
      account_import_staging: {
        Row: {
          account_alias_name: string | null
          base_name_candidate: string | null
          canonical_name_candidate: string | null
          confidence_score: number | null
          created_at: string
          dahab_account_number: string | null
          error_message: string | null
          extracted_currency_code: string | null
          id: number
          import_batch_id: number | null
          is_primary_account: boolean | null
          nature: string | null
          normalized_name_candidate: string | null
          raw_name: string | null
          review_status: string
          source_account_number: string | null
          source_row_number: number | null
          suggested_account_holder_id: number | null
          suggested_dahab_account_number: string | null
        }
        Insert: {
          account_alias_name?: string | null
          base_name_candidate?: string | null
          canonical_name_candidate?: string | null
          confidence_score?: number | null
          created_at?: string
          dahab_account_number?: string | null
          error_message?: string | null
          extracted_currency_code?: string | null
          id?: number
          import_batch_id?: number | null
          is_primary_account?: boolean | null
          nature?: string | null
          normalized_name_candidate?: string | null
          raw_name?: string | null
          review_status?: string
          source_account_number?: string | null
          source_row_number?: number | null
          suggested_account_holder_id?: number | null
          suggested_dahab_account_number?: string | null
        }
        Update: {
          account_alias_name?: string | null
          base_name_candidate?: string | null
          canonical_name_candidate?: string | null
          confidence_score?: number | null
          created_at?: string
          dahab_account_number?: string | null
          error_message?: string | null
          extracted_currency_code?: string | null
          id?: number
          import_batch_id?: number | null
          is_primary_account?: boolean | null
          nature?: string | null
          normalized_name_candidate?: string | null
          raw_name?: string | null
          review_status?: string
          source_account_number?: string | null
          source_row_number?: number | null
          suggested_account_holder_id?: number | null
          suggested_dahab_account_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_import_staging_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "account_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      account_link_review_queue: {
        Row: {
          base_name_candidate: string | null
          confidence_score: number | null
          created_at: string
          extracted_currency_code: string | null
          id: number
          import_batch_id: number | null
          normalized_name_candidate: string | null
          notes: string | null
          raw_name: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_account_number: string | null
          staging_id: number | null
          suggested_account_holder_id: number | null
        }
        Insert: {
          base_name_candidate?: string | null
          confidence_score?: number | null
          created_at?: string
          extracted_currency_code?: string | null
          id?: number
          import_batch_id?: number | null
          normalized_name_candidate?: string | null
          notes?: string | null
          raw_name?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_account_number?: string | null
          staging_id?: number | null
          suggested_account_holder_id?: number | null
        }
        Update: {
          base_name_candidate?: string | null
          confidence_score?: number | null
          created_at?: string
          extracted_currency_code?: string | null
          id?: number
          import_batch_id?: number | null
          normalized_name_candidate?: string | null
          notes?: string | null
          raw_name?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_account_number?: string | null
          staging_id?: number | null
          suggested_account_holder_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "account_link_review_queue_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "account_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_link_review_queue_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "account_import_staging"
            referencedColumns: ["id"]
          },
        ]
      }
      account_name_aliases: {
        Row: {
          account_id: number
          alias_name: string
          alias_type: string
          created_at: string
          id: number
        }
        Insert: {
          account_id: number
          alias_name: string
          alias_type?: string
          created_at?: string
          id?: number
        }
        Update: {
          account_id?: number
          alias_name?: string
          alias_type?: string
          created_at?: string
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "account_name_aliases_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "holder_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_name_aliases_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_holder_account_withdraw_limits"
            referencedColumns: ["holder_account_id"]
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
      branches: {
        Row: {
          city: string | null
          code: string
          created_at: string
          id: number
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          code: string
          created_at?: string
          id?: number
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          code?: string
          created_at?: string
          id?: number
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          currency_code: string
          currency_name: string
          symbol: string | null
        }
        Insert: {
          currency_code: string
          currency_name: string
          symbol?: string | null
        }
        Update: {
          currency_code?: string
          currency_name?: string
          symbol?: string | null
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          as_of_date: string
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id: number
          note: string | null
          source: string
          usd_rate: number
        }
        Insert: {
          as_of_date?: string
          created_at?: string
          created_by?: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          id?: never
          note?: string | null
          source?: string
          usd_rate: number
        }
        Update: {
          as_of_date?: string
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: never
          note?: string | null
          source?: string
          usd_rate?: number
        }
        Relationships: []
      }
      holder_account_limit_events: {
        Row: {
          actor_user_id: string | null
          changed_at: string
          holder_account_id: number
          id: number
          new_amount: number
          new_enabled: boolean
          note: string | null
          prev_amount: number
          prev_enabled: boolean
        }
        Insert: {
          actor_user_id?: string | null
          changed_at?: string
          holder_account_id: number
          id?: number
          new_amount: number
          new_enabled: boolean
          note?: string | null
          prev_amount: number
          prev_enabled: boolean
        }
        Update: {
          actor_user_id?: string | null
          changed_at?: string
          holder_account_id?: number
          id?: number
          new_amount?: number
          new_enabled?: boolean
          note?: string | null
          prev_amount?: number
          prev_enabled?: boolean
        }
        Relationships: []
      }
      holder_accounts: {
        Row: {
          account_alias_name: string | null
          account_display_name: string
          account_holder_id: number
          account_nature: string
          account_number: string
          balance_limit: number
          created_at: string
          credit_limit: number
          credit_used: number
          currency_code: string
          current_balance: number
          dahab_account_number: string | null
          debit_limit: number
          id: number
          is_primary_account: boolean
          status: string
          updated_at: string
          withdraw_limit_amount: number
          withdraw_limit_enabled: boolean
        }
        Insert: {
          account_alias_name?: string | null
          account_display_name: string
          account_holder_id: number
          account_nature: string
          account_number: string
          balance_limit?: number
          created_at?: string
          credit_limit?: number
          credit_used?: number
          currency_code: string
          current_balance?: number
          dahab_account_number?: string | null
          debit_limit?: number
          id?: number
          is_primary_account?: boolean
          status?: string
          updated_at?: string
          withdraw_limit_amount?: number
          withdraw_limit_enabled?: boolean
        }
        Update: {
          account_alias_name?: string | null
          account_display_name?: string
          account_holder_id?: number
          account_nature?: string
          account_number?: string
          balance_limit?: number
          created_at?: string
          credit_limit?: number
          credit_used?: number
          currency_code?: string
          current_balance?: number
          dahab_account_number?: string | null
          debit_limit?: number
          id?: number
          is_primary_account?: boolean
          status?: string
          updated_at?: string
          withdraw_limit_amount?: number
          withdraw_limit_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "holder_accounts_account_holder_id_fkey"
            columns: ["account_holder_id"]
            isOneToOne: false
            referencedRelation: "account_holders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holder_accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["currency_code"]
          },
        ]
      }
      holder_ledger_entries: {
        Row: {
          account_id: number
          balance_after: number
          created_at: string
          credit_amount: number
          currency_code: string
          debit_amount: number
          description: string | null
          id: number
          posted_at: string
          tx_number: string
        }
        Insert: {
          account_id: number
          balance_after: number
          created_at?: string
          credit_amount?: number
          currency_code: string
          debit_amount?: number
          description?: string | null
          id?: number
          posted_at: string
          tx_number: string
        }
        Update: {
          account_id?: number
          balance_after?: number
          created_at?: string
          credit_amount?: number
          currency_code?: string
          debit_amount?: number
          description?: string | null
          id?: number
          posted_at?: string
          tx_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "holder_ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "holder_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holder_ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_holder_account_withdraw_limits"
            referencedColumns: ["holder_account_id"]
          },
          {
            foreignKeyName: "holder_ledger_entries_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["currency_code"]
          },
        ]
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
          branch_id: number | null
          created_at: string
          full_name: string
          id: string
          must_change_password: boolean
        }
        Insert: {
          branch_id?: number | null
          created_at?: string
          full_name?: string
          id: string
          must_change_password?: boolean
        }
        Update: {
          branch_id?: number | null
          created_at?: string
          full_name?: string
          id?: string
          must_change_password?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string
          endpoint: string | null
          granted: boolean
          id: string
          label: string | null
          last_error: string | null
          last_seen_at: string
          last_success_at: string | null
          p256dh: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth?: string | null
          created_at?: string
          endpoint?: string | null
          granted?: boolean
          id?: string
          label?: string | null
          last_error?: string | null
          last_seen_at?: string
          last_success_at?: string | null
          p256dh?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string | null
          created_at?: string
          endpoint?: string | null
          granted?: boolean
          id?: string
          label?: string | null
          last_error?: string | null
          last_seen_at?: string
          last_success_at?: string | null
          p256dh?: string | null
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
          branch_id: number | null
          channel: Database["public"]["Enums"]["vault_channel"]
          comment: string
          corrected_by_tx_id: string | null
          correction_reason: string | null
          created_at: string
          created_by_user_id: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_account_id: string
          direction: Database["public"]["Enums"]["tx_direction"]
          id: string
          partial_approved: boolean
          posted_at: string | null
          reject_reason: string | null
          requested_amount_minor: number | null
          reverses_tx_id: string | null
          review_reason: string | null
          status: Database["public"]["Enums"]["tx_status"]
          tx_number: string
          vault_account_id: string | null
        }
        Insert: {
          amount_minor: number
          approved_by_user_id?: string | null
          branch_id?: number | null
          channel: Database["public"]["Enums"]["vault_channel"]
          comment: string
          corrected_by_tx_id?: string | null
          correction_reason?: string | null
          created_at?: string
          created_by_user_id: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_account_id: string
          direction: Database["public"]["Enums"]["tx_direction"]
          id?: string
          partial_approved?: boolean
          posted_at?: string | null
          reject_reason?: string | null
          requested_amount_minor?: number | null
          reverses_tx_id?: string | null
          review_reason?: string | null
          status: Database["public"]["Enums"]["tx_status"]
          tx_number: string
          vault_account_id?: string | null
        }
        Update: {
          amount_minor?: number
          approved_by_user_id?: string | null
          branch_id?: number | null
          channel?: Database["public"]["Enums"]["vault_channel"]
          comment?: string
          corrected_by_tx_id?: string | null
          correction_reason?: string | null
          created_at?: string
          created_by_user_id?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_account_id?: string
          direction?: Database["public"]["Enums"]["tx_direction"]
          id?: string
          partial_approved?: boolean
          posted_at?: string | null
          reject_reason?: string | null
          requested_amount_minor?: number | null
          reverses_tx_id?: string | null
          review_reason?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          tx_number?: string
          vault_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_corrected_by_tx_id_fkey"
            columns: ["corrected_by_tx_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_account_id_fkey"
            columns: ["customer_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_reverses_tx_id_fkey"
            columns: ["reverses_tx_id"]
            isOneToOne: false
            referencedRelation: "transactions"
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
      webauthn_challenges: {
        Row: {
          challenge: string
          created_at: string
          email: string | null
          expires_at: string
          id: string
          purpose: string
          user_id: string | null
        }
        Insert: {
          challenge: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          purpose: string
          user_id?: string | null
        }
        Update: {
          challenge?: string
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          purpose?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webauthn_credentials: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          device_label: string
          id: string
          last_used_at: string | null
          public_key: string
          transports: string[]
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          device_label?: string
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: string[]
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          device_label?: string
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: string[]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      fx_rates_current: {
        Row: {
          as_of_date: string | null
          currency: Database["public"]["Enums"]["currency_code"] | null
          source: string | null
          usd_rate: number | null
        }
        Relationships: []
      }
      v_holder_account_withdraw_limits: {
        Row: {
          account_number: string | null
          available_to_withdraw: number | null
          currency_code: string | null
          current_balance: number | null
          holder_account_id: number | null
          withdraw_limit_amount: number | null
          withdraw_limit_enabled: boolean | null
        }
        Insert: {
          account_number?: string | null
          available_to_withdraw?: never
          currency_code?: string | null
          current_balance?: number | null
          holder_account_id?: number | null
          withdraw_limit_amount?: number | null
          withdraw_limit_enabled?: boolean | null
        }
        Update: {
          account_number?: string | null
          available_to_withdraw?: never
          currency_code?: string | null
          current_balance?: number | null
          holder_account_id?: number | null
          withdraw_limit_amount?: number | null
          withdraw_limit_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "holder_accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["currency_code"]
          },
        ]
      }
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
      add_account_to_holder: {
        Args: { p_account: Json; p_holder_id: number }
        Returns: number
      }
      admin_change_user_email: {
        Args: { p_new_email: string; p_target_user: string }
        Returns: undefined
      }
      admin_list_push_devices: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          endpoint_present: boolean
          granted: boolean
          id: string
          label: string
          last_error: string
          last_seen_at: string
          last_success_at: string
          user_agent: string
        }[]
      }
      admin_list_push_status: {
        Args: never
        Returns: {
          browser_push_enabled: boolean
          full_name: string
          last_seen_at: string
          last_success_at: string
          subscription_count: number
          user_id: string
        }[]
      }
      admin_reset_password: { Args: { p_target_user: string }; Returns: Json }
      admin_send_test_notification: {
        Args: { p_user_id: string }
        Returns: string
      }
      admin_set_holder_owner: {
        Args: { p_holder_id: number; p_owner: string }
        Returns: undefined
      }
      approve_import_batch: { Args: { p_batch_id: number }; Returns: Json }
      approve_transaction:
        | {
            Args: { p_tx_id: string }
            Returns: {
              amount_minor: number
              approved_by_user_id: string | null
              branch_id: number | null
              channel: Database["public"]["Enums"]["vault_channel"]
              comment: string
              corrected_by_tx_id: string | null
              correction_reason: string | null
              created_at: string
              created_by_user_id: string
              currency: Database["public"]["Enums"]["currency_code"]
              customer_account_id: string
              direction: Database["public"]["Enums"]["tx_direction"]
              id: string
              partial_approved: boolean
              posted_at: string | null
              reject_reason: string | null
              requested_amount_minor: number | null
              reverses_tx_id: string | null
              review_reason: string | null
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
        | {
            Args: { p_approved_amount_minor?: number; p_tx_id: string }
            Returns: {
              amount_minor: number
              approved_by_user_id: string | null
              branch_id: number | null
              channel: Database["public"]["Enums"]["vault_channel"]
              comment: string
              corrected_by_tx_id: string | null
              correction_reason: string | null
              created_at: string
              created_by_user_id: string
              currency: Database["public"]["Enums"]["currency_code"]
              customer_account_id: string
              direction: Database["public"]["Enums"]["tx_direction"]
              id: string
              partial_approved: boolean
              posted_at: string | null
              reject_reason: string | null
              requested_amount_minor: number | null
              reverses_tx_id: string | null
              review_reason: string | null
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
      clear_must_change_password: { Args: never; Returns: undefined }
      correct_transaction: {
        Args: {
          p_correction_reason: string
          p_new_amount_minor: number
          p_new_comment: string
          p_tx_id: string
        }
        Returns: {
          amount_minor: number
          approved_by_user_id: string | null
          branch_id: number | null
          channel: Database["public"]["Enums"]["vault_channel"]
          comment: string
          corrected_by_tx_id: string | null
          correction_reason: string | null
          created_at: string
          created_by_user_id: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_account_id: string
          direction: Database["public"]["Enums"]["tx_direction"]
          id: string
          partial_approved: boolean
          posted_at: string | null
          reject_reason: string | null
          requested_amount_minor: number | null
          reverses_tx_id: string | null
          review_reason: string | null
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
      create_holder_with_accounts:
        | {
            Args: {
              p_accounts: Json
              p_canonical_name: string
              p_holder_type: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_accounts: Json
              p_canonical_name: string
              p_email?: string
              p_holder_type: string
              p_phone?: string
            }
            Returns: Json
          }
      ensure_customer_account_for_holder_account: {
        Args: { p_holder_account_id: number }
        Returns: string
      }
      get_group_totals: { Args: { p_group_id: number }; Returns: Json }
      get_holder_currency_totals: {
        Args: { p_holder_id: number }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_linked_accounts_batch: {
        Args: { p_batch_id: number }
        Returns: Json
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      lookup_user_email_for_credential: {
        Args: { p_credential_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      next_dahab_account_number: { Args: never; Returns: string }
      next_holder_account_number: {
        Args: { p_currency: string; p_dahab: string }
        Returns: string
      }
      notif_self_test: { Args: never; Returns: string }
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
          branch_id: number | null
          channel: Database["public"]["Enums"]["vault_channel"]
          comment: string
          corrected_by_tx_id: string | null
          correction_reason: string | null
          created_at: string
          created_by_user_id: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_account_id: string
          direction: Database["public"]["Enums"]["tx_direction"]
          id: string
          partial_approved: boolean
          posted_at: string | null
          reject_reason: string | null
          requested_amount_minor: number | null
          reverses_tx_id: string | null
          review_reason: string | null
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
          branch_id: number | null
          channel: Database["public"]["Enums"]["vault_channel"]
          comment: string
          corrected_by_tx_id: string | null
          correction_reason: string | null
          created_at: string
          created_by_user_id: string
          currency: Database["public"]["Enums"]["currency_code"]
          customer_account_id: string
          direction: Database["public"]["Enums"]["tx_direction"]
          id: string
          partial_approved: boolean
          posted_at: string | null
          reject_reason: string | null
          requested_amount_minor: number | null
          reverses_tx_id: string | null
          review_reason: string | null
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
      report_consolidated_usd: { Args: never; Returns: Json }
      resolve_review_row: {
        Args: { p_decision: Json; p_row_id: number }
        Returns: Json
      }
      run_notification_reminders: { Args: never; Returns: Json }
      seed_demo_ledger: {
        Args: { p_admin_id: string; p_consumer_id: string; p_teller_id: string }
        Returns: Json
      }
      sp_account_limits: {
        Args: { p_account_id: number }
        Returns: {
          account_id: number
          available_credit: number
          available_to_withdraw: number
          balance: number
          balance_limit: number
          credit_limit: number
          credit_used: number
          currency_code: string
          over_limit: boolean
          spendable_balance: number
        }[]
      }
      sp_set_account_limits: {
        Args: {
          p_account_id: number
          p_balance_limit: number
          p_credit_limit: number
        }
        Returns: undefined
      }
      sp_set_holder_withdraw_limit: {
        Args: {
          p_amount: number
          p_enabled: boolean
          p_holder_account_id: number
          p_note?: string
        }
        Returns: undefined
      }
      sp_withdraw_quote: {
        Args: { p_account_id: number; p_amount: number }
        Returns: {
          account_id: number
          allowed: boolean
          amount: number
          available_credit: number
          available_to_withdraw: number
          balance: number
          balance_limit: number
          credit_limit: number
          credit_used: number
          currency_code: string
          reason: string
          shortfall: number
          spendable_balance: number
          use_balance: number
          use_credit: number
        }[]
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
        | "test"
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
        "test",
      ],
      notification_severity: ["info", "warning", "critical"],
      tx_direction: ["deposit", "withdraw"],
      tx_status: ["posted", "pending", "rejected", "reversed"],
      vault_channel: ["cash", "bank"],
    },
  },
} as const
