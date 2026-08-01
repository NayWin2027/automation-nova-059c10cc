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
      activity_logs: {
        Row: {
          action: string | null
          created_at: string
          id: string
          metadata: Json | null
          tool_name: string
          user_id: string
        }
        Insert: {
          action?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          tool_name: string
          user_id: string
        }
        Update: {
          action?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          tool_name?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          sender_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          sender_id: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          sender_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_secrets: {
        Row: {
          created_at: string
          id: string
          secret_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          secret_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          secret_hash?: string
        }
        Relationships: []
      }
      admin_totp_secrets: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          totp_secret: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          totp_secret: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          totp_secret?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      credit_topups: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean
          note: string | null
          topup_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          note?: string | null
          topup_type?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          note?: string | null
          topup_type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_orders: {
        Row: {
          admin_bonus_amount: number | null
          admin_credit_amount: number | null
          admin_notes: string | null
          approved_at: string | null
          approved_by: string | null
          contact_method: string | null
          contact_value: string | null
          created_at: string
          id: string
          order_number: string
          order_type: string
          payment_method: string
          payment_ref: string | null
          referrer_display_id: string | null
          slip_image_path: string | null
          status: string
          updated_at: string
          user_email: string
          user_id: string | null
        }
        Insert: {
          admin_bonus_amount?: number | null
          admin_credit_amount?: number | null
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          contact_method?: string | null
          contact_value?: string | null
          created_at?: string
          id?: string
          order_number: string
          order_type: string
          payment_method: string
          payment_ref?: string | null
          referrer_display_id?: string | null
          slip_image_path?: string | null
          status?: string
          updated_at?: string
          user_email: string
          user_id?: string | null
        }
        Update: {
          admin_bonus_amount?: number | null
          admin_credit_amount?: number | null
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          contact_method?: string | null
          contact_value?: string | null
          created_at?: string
          id?: string
          order_number?: string
          order_type?: string
          payment_method?: string
          payment_ref?: string | null
          referrer_display_id?: string | null
          slip_image_path?: string | null
          status?: string
          updated_at?: string
          user_email?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_session_id: string | null
          ban_reason: string | null
          created_at: string
          credits: number
          credits_expires_at: string | null
          credits_started_at: string | null
          display_name: string | null
          email: string
          id: string
          is_banned: boolean
          plan: Database["public"]["Enums"]["subscription_plan"]
          referral_code: string | null
          referral_reward_claimed: boolean
          referred_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_session_id?: string | null
          ban_reason?: string | null
          created_at?: string
          credits?: number
          credits_expires_at?: string | null
          credits_started_at?: string | null
          display_name?: string | null
          email: string
          id?: string
          is_banned?: boolean
          plan?: Database["public"]["Enums"]["subscription_plan"]
          referral_code?: string | null
          referral_reward_claimed?: boolean
          referred_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_session_id?: string | null
          ban_reason?: string | null
          created_at?: string
          credits?: number
          credits_expires_at?: string | null
          credits_started_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
          is_banned?: boolean
          plan?: Database["public"]["Enums"]["subscription_plan"]
          referral_code?: string | null
          referral_reward_claimed?: boolean
          referred_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promotion_usage_tracking: {
        Row: {
          created_at: string
          device_fingerprint: string
          device_model: string | null
          id: string
          ip_address: string
          tool_id: string
          usage_count: number
          usage_date: string
        }
        Insert: {
          created_at?: string
          device_fingerprint: string
          device_model?: string | null
          id?: string
          ip_address: string
          tool_id: string
          usage_count?: number
          usage_date?: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string
          device_model?: string | null
          id?: string
          ip_address?: string
          tool_id?: string
          usage_count?: number
          usage_date?: string
        }
        Relationships: []
      }
      recap_history: {
        Row: {
          created_at: string
          duration_seconds: number | null
          expires_at: string
          file_size_bytes: number | null
          id: string
          storage_path: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          expires_at?: string
          file_size_bytes?: number | null
          id?: string
          storage_path: string
          title?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          expires_at?: string
          file_size_bytes?: number | null
          id?: string
          storage_path?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      site_announcements: {
        Row: {
          action_label: string | null
          action_url: string | null
          created_at: string | null
          created_by: string | null
          custom_color: string | null
          id: string
          is_active: boolean
          message: string
          type: string
          updated_at: string | null
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_color?: string | null
          id?: string
          is_active?: boolean
          message: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          created_at?: string | null
          created_by?: string | null
          custom_color?: string | null
          id?: string
          is_active?: boolean
          message?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tool_settings: {
        Row: {
          created_at: string | null
          credit_cost: number | null
          daily_free_limit: number | null
          description: string
          id: string
          is_enabled: boolean | null
          is_premium: boolean | null
          requires_auth: boolean | null
          server_credit_per_min: number
          tier_limits: Json | null
          title: string
          tool_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credit_cost?: number | null
          daily_free_limit?: number | null
          description: string
          id?: string
          is_enabled?: boolean | null
          is_premium?: boolean | null
          requires_auth?: boolean | null
          server_credit_per_min?: number
          tier_limits?: Json | null
          title: string
          tool_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credit_cost?: number | null
          daily_free_limit?: number | null
          description?: string
          id?: string
          is_enabled?: boolean | null
          is_premium?: boolean | null
          requires_auth?: boolean | null
          server_credit_per_min?: number
          tier_limits?: Json | null
          title?: string
          tool_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tutorials: {
        Row: {
          category: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_published: boolean
          order_index: number
          storage_path: string | null
          title: string
          updated_at: string
          video_qualities: Json | null
          video_url: string | null
          view_count: number
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_published?: boolean
          order_index?: number
          storage_path?: string | null
          title: string
          updated_at?: string
          video_qualities?: Json | null
          video_url?: string | null
          view_count?: number
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_published?: boolean
          order_index?: number
          storage_path?: string | null
          title?: string
          updated_at?: string
          video_qualities?: Json | null
          video_url?: string | null
          view_count?: number
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          created_at: string
          device_fingerprint: string
          device_info: Json | null
          id: string
          last_used_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_fingerprint: string
          device_info?: Json | null
          id?: string
          last_used_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string
          device_info?: Json | null
          id?: string
          last_used_at?: string
          user_id?: string
        }
        Relationships: []
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
          role?: Database["public"]["Enums"]["app_role"]
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
      user_tool_usage: {
        Row: {
          created_at: string | null
          deduct_count: number
          error_count: number
          id: string
          success_count: number
          tool_id: string
          usage_count: number | null
          usage_date: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deduct_count?: number
          error_count?: number
          id?: string
          success_count?: number
          tool_id: string
          usage_count?: number | null
          usage_date?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          deduct_count?: number
          error_count?: number
          id?: string
          success_count?: number
          tool_id?: string
          usage_count?: number | null
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      safe_app_settings: {
        Row: {
          id: string | null
          key: string | null
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          id?: string | null
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          id?: string | null
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      safe_plan_settings: {
        Row: {
          value: Json | null
        }
        Insert: {
          value?: Json | null
        }
        Update: {
          value?: Json | null
        }
        Relationships: []
      }
      safe_tool_settings: {
        Row: {
          credit_cost: number | null
          description: string | null
          id: string | null
          is_enabled: boolean | null
          is_premium: boolean | null
          requires_auth: boolean | null
          server_credit_per_min: number | null
          title: string | null
          tool_id: string | null
        }
        Insert: {
          credit_cost?: number | null
          description?: string | null
          id?: string | null
          is_enabled?: boolean | null
          is_premium?: boolean | null
          requires_auth?: boolean | null
          server_credit_per_min?: number | null
          title?: string | null
          tool_id?: string | null
        }
        Update: {
          credit_cost?: number | null
          description?: string | null
          id?: string | null
          is_enabled?: boolean | null
          is_premium?: boolean | null
          requires_auth?: boolean | null
          server_credit_per_min?: number | null
          title?: string | null
          tool_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_active_session: {
        Args: { _session_id: string; _user_id: string }
        Returns: boolean
      }
      check_admin_2fa_status: { Args: { _user_id: string }; Returns: Json }
      claim_referral_reward: { Args: { _user_id: string }; Returns: Json }
      cleanup_expired_recaps: { Args: never; Returns: undefined }
      count_referred_friends: { Args: { _user_id: string }; Returns: number }
      count_user_devices: { Args: { _user_id: string }; Returns: number }
      deduct_user_credits: {
        Args: {
          _custom_cost?: number
          _is_own_api?: boolean
          _tool_id: string
          _user_id: string
        }
        Returns: Json
      }
      generate_order_number: {
        Args: { _payment_method: string }
        Returns: string
      }
      get_or_create_referral_code: {
        Args: { _user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_tutorial_view: {
        Args: { _tutorial_id: string }
        Returns: number
      }
      record_tool_outcome: {
        Args: { _outcome: string; _tool_id: string; _user_id: string }
        Returns: Json
      }
      register_active_session: {
        Args: { _session_id: string; _user_id: string }
        Returns: undefined
      }
      tutorials_are_public: { Args: never; Returns: boolean }
      verify_admin_secret: { Args: { secret_input: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user" | "master_admin"
      subscription_plan: "free" | "pro" | "premium"
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
      app_role: ["admin", "user", "master_admin"],
      subscription_plan: ["free", "pro", "premium"],
    },
  },
} as const
