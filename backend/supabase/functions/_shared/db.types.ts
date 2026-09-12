export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      campaign_assets: {
        Row: {
          body: string | null
          call_to_action: string | null
          campaign_id: string
          channel: Database["public"]["Enums"]["campaign_channel"]
          created_at: string
          generated_by: string | null
          headline: string | null
          id: string
          image_path: string | null
          prompt_used: string | null
          variant_label: string
        }
        Insert: {
          body?: string | null
          call_to_action?: string | null
          campaign_id: string
          channel: Database["public"]["Enums"]["campaign_channel"]
          created_at?: string
          generated_by?: string | null
          headline?: string | null
          id?: string
          image_path?: string | null
          prompt_used?: string | null
          variant_label?: string
        }
        Update: {
          body?: string | null
          call_to_action?: string | null
          campaign_id?: string
          channel?: Database["public"]["Enums"]["campaign_channel"]
          created_at?: string
          generated_by?: string | null
          headline?: string | null
          id?: string
          image_path?: string | null
          prompt_used?: string | null
          variant_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_assets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          name: string
          offer: string | null
          opportunity_id: string | null
          restaurant_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          offer?: string | null
          opportunity_id?: string | null
          restaurant_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          offer?: string | null
          opportunity_id?: string | null
          restaurant_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_results: {
        Row: {
          actual_value: number
          baseline_value: number
          computed_at: string
          confidence_score: number | null
          estimated_incremental_cost: number | null
          estimated_incremental_profit: number | null
          estimated_incremental_revenue: number | null
          experiment_id: string
          id: string
          recommendation: string | null
          roi: number | null
        }
        Insert: {
          actual_value: number
          baseline_value: number
          computed_at?: string
          confidence_score?: number | null
          estimated_incremental_cost?: number | null
          estimated_incremental_profit?: number | null
          estimated_incremental_revenue?: number | null
          experiment_id: string
          id?: string
          recommendation?: string | null
          roi?: number | null
        }
        Update: {
          actual_value?: number
          baseline_value?: number
          computed_at?: string
          confidence_score?: number | null
          estimated_incremental_cost?: number | null
          estimated_incremental_profit?: number | null
          estimated_incremental_revenue?: number | null
          experiment_id?: string
          id?: string
          recommendation?: string | null
          roi?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_results_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          baseline_end: string
          baseline_start: string
          campaign_id: string
          created_at: string
          experiment_end: string
          experiment_start: string
          id: string
          restaurant_id: string
          status: Database["public"]["Enums"]["experiment_status"]
          target_metric: Database["public"]["Enums"]["target_metric"]
        }
        Insert: {
          baseline_end: string
          baseline_start: string
          campaign_id: string
          created_at?: string
          experiment_end: string
          experiment_start: string
          id?: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["experiment_status"]
          target_metric?: Database["public"]["Enums"]["target_metric"]
        }
        Update: {
          baseline_end?: string
          baseline_start?: string
          campaign_id?: string
          created_at?: string
          experiment_end?: string
          experiment_start?: string
          id?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["experiment_status"]
          target_metric?: Database["public"]["Enums"]["target_metric"]
        }
        Relationships: [
          {
            foreignKeyName: "experiments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_runs: {
        Row: {
          error: string | null
          fetched_count: number
          finished_at: string | null
          id: string
          new_count: number
          source: Database["public"]["Enums"]["signal_source"]
          started_at: string
          status: Database["public"]["Enums"]["run_status"]
        }
        Insert: {
          error?: string | null
          fetched_count?: number
          finished_at?: string | null
          id?: string
          new_count?: number
          source: Database["public"]["Enums"]["signal_source"]
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
        }
        Update: {
          error?: string | null
          fetched_count?: number
          finished_at?: string | null
          id?: string
          new_count?: number
          source?: Database["public"]["Enums"]["signal_source"]
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          created_at: string
          id: string
          name: string
          restaurant_id: string
          unit: string
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          unit: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          unit?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          counted_at: string
          created_at: string
          id: string
          ingredient_id: string
          quantity_on_hand: number
          restaurant_id: string
          unit: string
          upload_id: string | null
        }
        Insert: {
          counted_at?: string
          created_at?: string
          id?: string
          ingredient_id: string
          quantity_on_hand: number
          restaurant_id: string
          unit: string
          upload_id?: string | null
        }
        Update: {
          counted_at?: string
          created_at?: string
          id?: string
          ingredient_id?: string
          quantity_on_hand?: number
          restaurant_id?: string
          unit?: string
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_ingredients: {
        Row: {
          ingredient_id: string
          menu_item_id: string
          quantity: number
        }
        Insert: {
          ingredient_id: string
          menu_item_id: string
          quantity: number
        }
        Update: {
          ingredient_id?: string
          menu_item_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_ingredients_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean
          category: string | null
          contribution: number | null
          created_at: string
          description: string | null
          estimated_cost: number | null
          id: string
          name: string
          price: number
          restaurant_id: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          contribution?: number | null
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          id?: string
          name: string
          price: number
          restaurant_id: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          contribution?: number | null
          created_at?: string
          description?: string | null
          estimated_cost?: number | null
          id?: string
          name?: string
          price?: number
          restaurant_id?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          created_at: string
          estimated_cost: number | null
          estimated_incremental_profit: number | null
          estimated_incremental_revenue: number | null
          id: string
          local_relevance_score: number
          menu_fit_score: number
          menu_item_id: string | null
          missing_ingredients: string[]
          operational_fit_score: number
          overall_score: number
          profitability_score: number
          recommendation: string | null
          restaurant_id: string
          scoring_version: string
          status: Database["public"]["Enums"]["opportunity_status"]
          suggested_name: string | null
          suggested_price: number | null
          trend_id: string
          trend_score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          estimated_cost?: number | null
          estimated_incremental_profit?: number | null
          estimated_incremental_revenue?: number | null
          id?: string
          local_relevance_score: number
          menu_fit_score: number
          menu_item_id?: string | null
          missing_ingredients?: string[]
          operational_fit_score: number
          overall_score: number
          profitability_score: number
          recommendation?: string | null
          restaurant_id: string
          scoring_version?: string
          status?: Database["public"]["Enums"]["opportunity_status"]
          suggested_name?: string | null
          suggested_price?: number | null
          trend_id: string
          trend_score: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          estimated_cost?: number | null
          estimated_incremental_profit?: number | null
          estimated_incremental_revenue?: number | null
          id?: string
          local_relevance_score?: number
          menu_fit_score?: number
          menu_item_id?: string | null
          missing_ingredients?: string[]
          operational_fit_score?: number
          overall_score?: number
          profitability_score?: number
          recommendation?: string | null
          restaurant_id?: string
          scoring_version?: string
          status?: Database["public"]["Enums"]["opportunity_status"]
          suggested_name?: string | null
          suggested_price?: number | null
          trend_id?: string
          trend_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_trend_id_fkey"
            columns: ["trend_id"]
            isOneToOne: false
            referencedRelation: "trends"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_evidence: {
        Row: {
          created_at: string
          description: string
          display_value: string | null
          evidence_type: Database["public"]["Enums"]["evidence_type"]
          id: string
          opportunity_id: string
          source: string
          value: number | null
        }
        Insert: {
          created_at?: string
          description: string
          display_value?: string | null
          evidence_type: Database["public"]["Enums"]["evidence_type"]
          id?: string
          opportunity_id: string
          source: string
          value?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          display_value?: string | null
          evidence_type?: Database["public"]["Enums"]["evidence_type"]
          id?: string
          opportunity_id?: string
          source?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_evidence_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_signals: {
        Row: {
          fetched_at: string
          id: string
          ingest_run_id: string | null
          observed_at: string | null
          payload: Json
          processed_at: string | null
          query: string | null
          region: string | null
          source: Database["public"]["Enums"]["signal_source"]
          source_id: string
        }
        Insert: {
          fetched_at?: string
          id?: string
          ingest_run_id?: string | null
          observed_at?: string | null
          payload: Json
          processed_at?: string | null
          query?: string | null
          region?: string | null
          source: Database["public"]["Enums"]["signal_source"]
          source_id: string
        }
        Update: {
          fetched_at?: string
          id?: string
          ingest_run_id?: string | null
          observed_at?: string | null
          payload?: Json
          processed_at?: string | null
          query?: string | null
          region?: string | null
          source?: Database["public"]["Enums"]["signal_source"]
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_signals_ingest_run_id_fkey"
            columns: ["ingest_run_id"]
            isOneToOne: false
            referencedRelation: "ingest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          city: string | null
          created_at: string
          cuisine_type: string | null
          description: string | null
          id: string
          name: string
          owner_id: string
          state: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          cuisine_type?: string | null
          description?: string | null
          id?: string
          name: string
          owner_id: string
          state?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          cuisine_type?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          state?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          channel: Database["public"]["Enums"]["sales_channel"]
          created_at: string
          id: string
          menu_item_id: string | null
          quantity: number
          restaurant_id: string
          revenue: number
          sold_at: string
          upload_id: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["sales_channel"]
          created_at?: string
          id?: string
          menu_item_id?: string | null
          quantity: number
          restaurant_id: string
          revenue: number
          sold_at: string
          upload_id?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["sales_channel"]
          created_at?: string
          id?: string
          menu_item_id?: string | null
          quantity?: number
          restaurant_id?: string
          revenue?: number
          sold_at?: string
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_signals: {
        Row: {
          created_at: string
          growth_rate: number | null
          id: string
          metadata: Json
          observed_at: string
          raw_signal_id: string | null
          signal_value: number
          source: Database["public"]["Enums"]["signal_source"]
          trend_id: string
        }
        Insert: {
          created_at?: string
          growth_rate?: number | null
          id?: string
          metadata?: Json
          observed_at: string
          raw_signal_id?: string | null
          signal_value: number
          source: Database["public"]["Enums"]["signal_source"]
          trend_id: string
        }
        Update: {
          created_at?: string
          growth_rate?: number | null
          id?: string
          metadata?: Json
          observed_at?: string
          raw_signal_id?: string | null
          signal_value?: number
          source?: Database["public"]["Enums"]["signal_source"]
          trend_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trend_signals_raw_signal_id_fkey"
            columns: ["raw_signal_id"]
            isOneToOne: false
            referencedRelation: "raw_signals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trend_signals_trend_id_fkey"
            columns: ["trend_id"]
            isOneToOne: false
            referencedRelation: "trends"
            referencedColumns: ["id"]
          },
        ]
      }
      trends: {
        Row: {
          category: Database["public"]["Enums"]["trend_category"]
          description: string | null
          first_detected_at: string
          id: string
          keywords: string[]
          last_updated_at: string
          name: string
          region: string | null
          slug: string
          status: Database["public"]["Enums"]["trend_status"]
          trend_score: number
          trend_velocity: number
        }
        Insert: {
          category?: Database["public"]["Enums"]["trend_category"]
          description?: string | null
          first_detected_at?: string
          id?: string
          keywords?: string[]
          last_updated_at?: string
          name: string
          region?: string | null
          slug: string
          status?: Database["public"]["Enums"]["trend_status"]
          trend_score?: number
          trend_velocity?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["trend_category"]
          description?: string | null
          first_detected_at?: string
          id?: string
          keywords?: string[]
          last_updated_at?: string
          name?: string
          region?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["trend_status"]
          trend_score?: number
          trend_velocity?: number
        }
        Relationships: []
      }
      uploads: {
        Row: {
          completed_at: string | null
          created_at: string
          error_count: number | null
          errors: Json
          id: string
          inserted_count: number | null
          kind: Database["public"]["Enums"]["upload_kind"]
          restaurant_id: string
          row_count: number | null
          status: Database["public"]["Enums"]["upload_status"]
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_count?: number | null
          errors?: Json
          id?: string
          inserted_count?: number | null
          kind: Database["public"]["Enums"]["upload_kind"]
          restaurant_id: string
          row_count?: number | null
          status?: Database["public"]["Enums"]["upload_status"]
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_count?: number | null
          errors?: Json
          id?: string
          inserted_count?: number | null
          kind?: Database["public"]["Enums"]["upload_kind"]
          restaurant_id?: string
          row_count?: number | null
          status?: Database["public"]["Enums"]["upload_status"]
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uploads_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      current_inventory: {
        Row: {
          counted_at: string | null
          ingredient_id: string | null
          ingredient_name: string | null
          quantity_on_hand: number | null
          restaurant_id: string | null
          unit: string | null
          unit_cost: number | null
          value_on_hand: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_baselines: {
        Row: {
          avg_contribution: number | null
          avg_revenue: number | null
          avg_units: number | null
          day_of_week: number | null
          menu_item_id: string | null
          observed_days: number | null
          restaurant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_daily_sales: {
        Row: {
          contribution: number | null
          day_of_week: number | null
          food_cost: number | null
          local_date: string | null
          menu_item_id: string | null
          restaurant_id: string | null
          revenue: number | null
          units: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      owns_restaurant: { Args: { rid: string }; Returns: boolean }
    }
    Enums: {
      campaign_channel: "instagram" | "tiktok" | "sms" | "email" | "in_store"
      campaign_status:
        | "draft"
        | "scheduled"
        | "live"
        | "paused"
        | "completed"
        | "cancelled"
      evidence_type:
        | "trend_growth"
        | "menu_similarity"
        | "ingredient_overlap"
        | "local_relevance"
        | "margin_impact"
        | "sales_baseline"
      experiment_status:
        | "planned"
        | "running"
        | "measuring"
        | "completed"
        | "abandoned"
      opportunity_status:
        | "new"
        | "viewed"
        | "accepted"
        | "rejected"
        | "testing"
        | "completed"
      run_status: "running" | "succeeded" | "failed"
      sales_channel: "in_store" | "online" | "doordash" | "ubereats" | "other"
      signal_source:
        | "google_trends"
        | "reddit"
        | "tiktok"
        | "instagram"
        | "local_events"
        | "news"
        | "manual"
      target_metric:
        | "revenue"
        | "orders"
        | "menu_item_sales"
        | "contribution_profit"
        | "customer_count"
      trend_category:
        | "food"
        | "drink"
        | "ingredient"
        | "technique"
        | "social"
        | "seasonal"
        | "event"
        | "local_event"
      trend_status: "active" | "fading" | "archived"
      upload_kind: "menu" | "sales" | "inventory"
      upload_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "partial"
        | "failed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      campaign_channel: ["instagram", "tiktok", "sms", "email", "in_store"],
      campaign_status: [
        "draft",
        "scheduled",
        "live",
        "paused",
        "completed",
        "cancelled",
      ],
      evidence_type: [
        "trend_growth",
        "menu_similarity",
        "ingredient_overlap",
        "local_relevance",
        "margin_impact",
        "sales_baseline",
      ],
      experiment_status: [
        "planned",
        "running",
        "measuring",
        "completed",
        "abandoned",
      ],
      opportunity_status: [
        "new",
        "viewed",
        "accepted",
        "rejected",
        "testing",
        "completed",
      ],
      run_status: ["running", "succeeded", "failed"],
      sales_channel: ["in_store", "online", "doordash", "ubereats", "other"],
      signal_source: [
        "google_trends",
        "reddit",
        "tiktok",
        "instagram",
        "local_events",
        "news",
        "manual",
      ],
      target_metric: [
        "revenue",
        "orders",
        "menu_item_sales",
        "contribution_profit",
        "customer_count",
      ],
      trend_category: [
        "food",
        "drink",
        "ingredient",
        "technique",
        "social",
        "seasonal",
        "event",
        "local_event",
      ],
      trend_status: ["active", "fading", "archived"],
      upload_kind: ["menu", "sales", "inventory"],
      upload_status: [
        "pending",
        "processing",
        "succeeded",
        "partial",
        "failed",
      ],
    },
  },
} as const

