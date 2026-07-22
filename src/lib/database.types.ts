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
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
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
      acts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          normalized_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          normalized_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          normalized_name?: string | null
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bio: string | null
          created_at: string
          default_role: string | null
          display_name: string | null
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          default_role?: string | null
          display_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          default_role?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      shows: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          date: string
          id: string
          kind: Database["public"]["Enums"]["stop_kind"]
          label: string | null
          latitude: number | null
          longitude: number | null
          tour_id: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          kind?: Database["public"]["Enums"]["stop_kind"]
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          tour_id: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          kind?: Database["public"]["Enums"]["stop_kind"]
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          tour_id?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shows_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shows_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_members: {
        Row: {
          created_at: string
          id: string
          role: string | null
          tour_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string | null
          tour_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string | null
          tour_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_members_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tour_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          act_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          start_date: string | null
          title: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility"]
        }
        Insert: {
          act_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          start_date?: string | null
          title?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Update: {
          act_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          start_date?: string | null
          title?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "tours_act_id_fkey"
            columns: ["act_id"]
            isOneToOne: false
            referencedRelation: "acts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          city: string
          country: string | null
          created_at: string
          created_by: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          normalized_city: string | null
          normalized_name: string | null
        }
        Insert: {
          address?: string | null
          city: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          normalized_city?: string | null
          normalized_name?: string | null
        }
        Update: {
          address?: string | null
          city?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          normalized_city?: string | null
          normalized_name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      crossed_paths: {
        Args: {
          max_miles?: number
          date_window_days?: number
        }
        Returns: {
          friend_id: string
          friend_display_name: string | null
          friend_username: string | null
          my_stop_id: string
          my_tour_id: string
          my_tour_title: string | null
          my_act_name: string | null
          my_kind: "show" | "off"
          my_venue_id: string | null
          my_venue_name: string | null
          my_venue_city: string | null
          my_venue_country: string | null
          my_venue_lat: number | null
          my_venue_lng: number | null
          my_label: string | null
          my_city: string | null
          my_country: string | null
          my_address: string | null
          my_date: string
          my_lat: number | null
          my_lng: number | null
          their_stop_id: string
          their_tour_id: string
          their_tour_title: string | null
          their_act_name: string | null
          their_kind: "show" | "off"
          their_venue_id: string | null
          their_venue_name: string | null
          their_venue_city: string | null
          their_venue_country: string | null
          their_venue_lat: number | null
          their_venue_lng: number | null
          their_label: string | null
          their_city: string | null
          their_country: string | null
          their_address: string | null
          their_date: string
          their_lat: number | null
          their_lng: number | null
          miles: number
        }[]
      }
      create_tour_with_membership: {
        Args: {
          p_tour_id: string
          p_act_id: string | null
          p_act_name: string
          p_title: string | null
          p_start_date: string | null
          p_end_date: string | null
          p_visibility: Database["public"]["Enums"]["visibility"]
          p_role: string | null
        }
        Returns: string
      }
      get_or_create_act: {
        Args: {
          p_name: string
        }
        Returns: string
      }
      update_tour_with_role: {
        Args: {
          p_tour_id: string
          p_act_name: string
          p_title: string | null
          p_start_date: string | null
          p_end_date: string | null
          p_visibility: Database["public"]["Enums"]["visibility"] | null
          p_role: string | null
        }
        Returns: undefined
      }
      dedup_venues: {
        Args: {
          radius_m?: number
          max_km?: number
        }
        Returns: number
      }
      find_nearby_venue: {
        Args: {
          lat: number
          lng: number
          radius_m?: number
          name_hint?: string
        }
        Returns: {
          id: string
          name: string
          city: string
          distance_m: number
          show_count: number
        }[]
      }
      is_friends: {
        Args: {
          a: string
          b: string
        }
        Returns: boolean
      }
      merge_duplicate_venues: {
        Args: {
          radius_m?: number
        }
        Returns: number
      }
      merge_duplicate_venues_by_name: {
        Args: {
          max_km?: number
        }
        Returns: number
      }
      search_tours_by_act: {
        Args: {
          p_act_id: string
        }
        Returns: {
          id: string
          title: string | null
          start_date: string | null
          end_date: string | null
          created_at: string
          act_id: string
          act_name: string
          member_count: number
          creator_display_name: string | null
        }[]
      }
      search_venues: {
        Args: {
          term: string
          city_bias?: string
          max_results?: number
        }
        Returns: {
          id: string
          name: string
          city: string
          latitude: number
          longitude: number
          address: string
          show_count: number
        }[]
      }
    }
    Enums: {
      stop_kind: "show" | "off"
      visibility: "private" | "public" | "friends"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

