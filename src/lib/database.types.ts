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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_blocks: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          alert_id: string | null
          block_status: string
          blocked_at: string
          blocked_by: string | null
          client_id: string
          compliance_status: string
          id: string
          origin: string
          reason: string
          release_notes: string | null
          released_at: string | null
          released_by: string | null
          rule_id: string | null
          scope: string
          subaccount_id: string | null
          transaction_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          alert_id?: string | null
          block_status?: string
          blocked_at?: string
          blocked_by?: string | null
          client_id: string
          compliance_status?: string
          id?: string
          origin: string
          reason: string
          release_notes?: string | null
          released_at?: string | null
          released_by?: string | null
          rule_id?: string | null
          scope: string
          subaccount_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          alert_id?: string | null
          block_status?: string
          blocked_at?: string
          blocked_by?: string | null
          client_id?: string
          compliance_status?: string
          id?: string
          origin?: string
          reason?: string
          release_notes?: string | null
          released_at?: string | null
          released_by?: string | null
          rule_id?: string | null
          scope?: string
          subaccount_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_blocks_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_blocks_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_blocks_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_blocks_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_blocks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_blocks_released_by_fkey"
            columns: ["released_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_blocks_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_blocks_subaccount_id_fkey"
            columns: ["subaccount_id"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_blocks_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      acreditacion_lotes: {
        Row: {
          comision_cierre_monto: number
          comision_molipay_monto: number
          comision_payway_monto: number
          created_at: string
          fuente: string
          id: string
          importe_neto_liquidado: number
          importe_neto_original: number
          lote_acreditacion_id: string
          monto_adelanto_compensado: number
          notas: string | null
          renglon_id: string | null
          saldo_antes: number
          saldo_despues: number
          usuario_id: string | null
        }
        Insert: {
          comision_cierre_monto?: number
          comision_molipay_monto?: number
          comision_payway_monto?: number
          created_at?: string
          fuente?: string
          id?: string
          importe_neto_liquidado: number
          importe_neto_original: number
          lote_acreditacion_id: string
          monto_adelanto_compensado?: number
          notas?: string | null
          renglon_id?: string | null
          saldo_antes?: number
          saldo_despues?: number
          usuario_id?: string | null
        }
        Update: {
          comision_cierre_monto?: number
          comision_molipay_monto?: number
          comision_payway_monto?: number
          created_at?: string
          fuente?: string
          id?: string
          importe_neto_liquidado?: number
          importe_neto_original?: number
          lote_acreditacion_id?: string
          monto_adelanto_compensado?: number
          notas?: string | null
          renglon_id?: string | null
          saldo_antes?: number
          saldo_despues?: number
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acreditacion_lotes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      adelantos: {
        Row: {
          comercio_id: string
          created_at: string
          estado: string
          fecha_acreditacion: string | null
          fecha_resolucion: string | null
          fecha_solicitud: string
          id: string
          lote_acreditacion_id: string | null
          monto_por_acreditar: number | null
          monto_solicitado: number
          motivo: string | null
          plazo_adelantado_dias: number
          plazo_original_dias: number
          resuelto_por: string | null
          tasa_interes_pct: number | null
          updated_at: string
        }
        Insert: {
          comercio_id: string
          created_at?: string
          estado?: string
          fecha_acreditacion?: string | null
          fecha_resolucion?: string | null
          fecha_solicitud?: string
          id?: string
          lote_acreditacion_id?: string | null
          monto_por_acreditar?: number | null
          monto_solicitado: number
          motivo?: string | null
          plazo_adelantado_dias: number
          plazo_original_dias?: number
          resuelto_por?: string | null
          tasa_interes_pct?: number | null
          updated_at?: string
        }
        Update: {
          comercio_id?: string
          created_at?: string
          estado?: string
          fecha_acreditacion?: string | null
          fecha_resolucion?: string | null
          fecha_solicitud?: string
          id?: string
          lote_acreditacion_id?: string | null
          monto_por_acreditar?: number | null
          monto_solicitado?: number
          motivo?: string | null
          plazo_adelantado_dias?: number
          plazo_original_dias?: number
          resuelto_por?: string | null
          tasa_interes_pct?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "adelantos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adelantos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
          {
            foreignKeyName: "adelantos_lote_acreditacion_id_fkey"
            columns: ["lote_acreditacion_id"]
            isOneToOne: false
            referencedRelation: "lotes_acreditacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adelantos_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          activo: boolean
          created_at: string
          email: string
          id: string
          legajo: string
          nombre: string
          rol_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email: string
          id: string
          legajo: string
          nombre: string
          rol_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string
          id?: string
          legajo?: string
          nombre?: string
          rol_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          action: string
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          name: string
          parameters: Json
          parametros_pais: Json
          sort_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          action: string
          category: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          parameters?: Json
          parametros_pais?: Json
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          action?: string
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          parameters?: Json
          parametros_pais?: Json
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          client_id: string
          created_at: string
          dedupe_key: string | null
          description: string
          details: Json
          due_at: string
          id: string
          plaft_match_id: number | null
          resolution: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string | null
          status: string
          transaction_id: string | null
          type: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          client_id: string
          created_at?: string
          dedupe_key?: string | null
          description: string
          details?: Json
          due_at?: string
          id?: string
          plaft_match_id?: number | null
          resolution?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          status?: string
          transaction_id?: string | null
          type: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          client_id?: string
          created_at?: string
          dedupe_key?: string | null
          description?: string
          details?: Json
          due_at?: string
          id?: string
          plaft_match_id?: number | null
          resolution?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string | null
          status?: string
          transaction_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_plaft_match_id_fkey"
            columns: ["plaft_match_id"]
            isOneToOne: false
            referencedRelation: "plaft_coincidencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      api_endpoints: {
        Row: {
          created_at: string
          descripcion: string | null
          estado: string
          grupo: string
          id: string
          metodo: string
          nombre: string
          path: string
          rec: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          estado: string
          grupo: string
          id?: string
          metodo: string
          nombre: string
          path: string
          rec?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          estado?: string
          grupo?: string
          id?: string
          metodo?: string
          nombre?: string
          path?: string
          rec?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      api_restricciones: {
        Row: {
          api_usuario_id: string
          created_at: string
          estado: string
          fecha_creacion: string
          fecha_expiracion: string | null
          id: string
        }
        Insert: {
          api_usuario_id: string
          created_at?: string
          estado: string
          fecha_creacion?: string
          fecha_expiracion?: string | null
          id?: string
        }
        Update: {
          api_usuario_id?: string
          created_at?: string
          estado?: string
          fecha_creacion?: string
          fecha_expiracion?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_restricciones_api_usuario_id_fkey"
            columns: ["api_usuario_id"]
            isOneToOne: false
            referencedRelation: "api_usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usuario_endpoints: {
        Row: {
          api_usuario_id: string
          created_at: string
          estado: string | null
          grupo: string | null
          id: string
          metodo: string | null
          path: string | null
        }
        Insert: {
          api_usuario_id: string
          created_at?: string
          estado?: string | null
          grupo?: string | null
          id?: string
          metodo?: string | null
          path?: string | null
        }
        Update: {
          api_usuario_id?: string
          created_at?: string
          estado?: string | null
          grupo?: string | null
          id?: string
          metodo?: string | null
          path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usuario_endpoints_api_usuario_id_fkey"
            columns: ["api_usuario_id"]
            isOneToOne: false
            referencedRelation: "api_usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usuario_logs: {
        Row: {
          api_usuario_id: string
          cliente_id: string | null
          created_at: string
          detalle: Json | null
          endpoint: string | null
          fecha_hora: string | null
          id: string
          ip: string | null
          metodo: string | null
          status: number | null
          tiempo_respuesta_ms: number | null
        }
        Insert: {
          api_usuario_id: string
          cliente_id?: string | null
          created_at?: string
          detalle?: Json | null
          endpoint?: string | null
          fecha_hora?: string | null
          id?: string
          ip?: string | null
          metodo?: string | null
          status?: number | null
          tiempo_respuesta_ms?: number | null
        }
        Update: {
          api_usuario_id?: string
          cliente_id?: string | null
          created_at?: string
          detalle?: Json | null
          endpoint?: string | null
          fecha_hora?: string | null
          id?: string
          ip?: string | null
          metodo?: string | null
          status?: number | null
          tiempo_respuesta_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usuario_logs_api_usuario_id_fkey"
            columns: ["api_usuario_id"]
            isOneToOne: false
            referencedRelation: "api_usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usuarios: {
        Row: {
          codigo_usuario_api: string
          created_at: string
          estado: string
          id: string
          nombre_completo: string
          updated_at: string
          usuario: string
        }
        Insert: {
          codigo_usuario_api: string
          created_at?: string
          estado: string
          id?: string
          nombre_completo: string
          updated_at?: string
          usuario: string
        }
        Update: {
          codigo_usuario_api?: string
          created_at?: string
          estado?: string
          id?: string
          nombre_completo?: string
          updated_at?: string
          usuario?: string
        }
        Relationships: []
      }
      banderas: {
        Row: {
          created_at: string | null
          dias_habiles_acreditacion: number | null
          estado: string
          id: string
          metodo_key: string | null
          nombre: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          dias_habiles_acreditacion?: number | null
          estado?: string
          id?: string
          metodo_key?: string | null
          nombre: string
          tipo?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          dias_habiles_acreditacion?: number | null
          estado?: string
          id?: string
          metodo_key?: string | null
          nombre?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      banderas_cuotas: {
        Row: {
          bandera_id: string
          coeficiente: number | null
          cuotas: number
          estado: string
          id: string
          ten: number | null
        }
        Insert: {
          bandera_id: string
          coeficiente?: number | null
          cuotas: number
          estado?: string
          id?: string
          ten?: number | null
        }
        Update: {
          bandera_id?: string
          coeficiente?: number | null
          cuotas?: number
          estado?: string
          id?: string
          ten?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "banderas_cuotas_bandera_id_fkey"
            columns: ["bandera_id"]
            isOneToOne: false
            referencedRelation: "banderas"
            referencedColumns: ["id"]
          },
        ]
      }
      caja_molipay: {
        Row: {
          actualizado_por: string | null
          created_at: string
          id: string
          nombre: string
          observaciones: string | null
          saldo_bancario: number
          saldo_conciliado: number
          updated_at: string
        }
        Insert: {
          actualizado_por?: string | null
          created_at?: string
          id?: string
          nombre?: string
          observaciones?: string | null
          saldo_bancario?: number
          saldo_conciliado?: number
          updated_at?: string
        }
        Update: {
          actualizado_por?: string | null
          created_at?: string
          id?: string
          nombre?: string
          observaciones?: string | null
          saldo_bancario?: number
          saldo_conciliado?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "caja_molipay_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      caja_movimientos: {
        Row: {
          caja_id: string
          created_at: string
          id: string
          monto: number
          observaciones: string | null
          referencia: string | null
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          caja_id: string
          created_at?: string
          id?: string
          monto: number
          observaciones?: string | null
          referencia?: string | null
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          caja_id?: string
          created_at?: string
          id?: string
          monto?: number
          observaciones?: string | null
          referencia?: string | null
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_movimientos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "caja_molipay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caja_movimientos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas: {
        Row: {
          copias_ticket: number
          created_at: string
          eliminado_at: string | null
          estado: string
          id: string
          id_externo: string | null
          nombre: string
          numero: string
          permite_reembolsos: boolean
          requiere_aprobacion: boolean
          sincronizado_at: string | null
          sucursal_id: string
          terminal_id: string | null
          tope_reembolso: number | null
          umbral_aprobacion: number | null
          updated_at: string
        }
        Insert: {
          copias_ticket?: number
          created_at?: string
          eliminado_at?: string | null
          estado?: string
          id?: string
          id_externo?: string | null
          nombre: string
          numero: string
          permite_reembolsos?: boolean
          requiere_aprobacion?: boolean
          sincronizado_at?: string | null
          sucursal_id: string
          terminal_id?: string | null
          tope_reembolso?: number | null
          umbral_aprobacion?: number | null
          updated_at?: string
        }
        Update: {
          copias_ticket?: number
          created_at?: string
          eliminado_at?: string | null
          estado?: string
          id?: string
          id_externo?: string | null
          nombre?: string
          numero?: string
          permite_reembolsos?: boolean
          requiere_aprobacion?: boolean
          sincronizado_at?: string | null
          sucursal_id?: string
          terminal_id?: string | null
          tope_reembolso?: number | null
          umbral_aprobacion?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cajas_sucursal_id_fkey"
            columns: ["sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cajas_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: true
            referencedRelation: "terminales"
            referencedColumns: ["id"]
          },
        ]
      }
      canales_notificacion: {
        Row: {
          activo: boolean
          configuracion: Json | null
          created_at: string
          id: string
          nombre: string
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          configuracion?: Json | null
          created_at?: string
          id?: string
          nombre: string
          tipo: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          configuracion?: Json | null
          created_at?: string
          id?: string
          nombre?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_block_parameters: {
        Row: {
          client_id: string
          company_min_wages: number | null
          created_at: string
          id: string
          individual_min_wages: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          company_min_wages?: number | null
          created_at?: string
          id?: string
          individual_min_wages?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          company_min_wages?: number | null
          created_at?: string
          id?: string
          individual_min_wages?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_block_parameters_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_block_parameters_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_api_usuarios: {
        Row: {
          api_usuario_id: string
          cliente_legajo: string
          created_at: string
          id: string
        }
        Insert: {
          api_usuario_id: string
          cliente_legajo: string
          created_at?: string
          id?: string
        }
        Update: {
          api_usuario_id?: string
          cliente_legajo?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_api_usuarios_api_usuario_id_fkey"
            columns: ["api_usuario_id"]
            isOneToOne: false
            referencedRelation: "api_usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_api_usuarios_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_api_usuarios_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_api_usuarios_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_api_usuarios_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      cliente_comercios_pst: {
        Row: {
          cliente_legajo: string
          created_at: string
          email: string | null
          id: string
          legajo_comercio: string | null
          nombre: string
        }
        Insert: {
          cliente_legajo: string
          created_at?: string
          email?: string | null
          id?: string
          legajo_comercio?: string | null
          nombre: string
        }
        Update: {
          cliente_legajo?: string
          created_at?: string
          email?: string | null
          id?: string
          legajo_comercio?: string | null
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_comercios_pst_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_comercios_pst_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_comercios_pst_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_comercios_pst_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      cliente_integraciones_ecommerce: {
        Row: {
          api_key: string | null
          cliente_legajo: string
          created_at: string
          estado: string
          id: string
          plataforma: string
          webhook_url: string | null
        }
        Insert: {
          api_key?: string | null
          cliente_legajo: string
          created_at?: string
          estado?: string
          id?: string
          plataforma: string
          webhook_url?: string | null
        }
        Update: {
          api_key?: string | null
          cliente_legajo?: string
          created_at?: string
          estado?: string
          id?: string
          plataforma?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_integraciones_ecommerce_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_integraciones_ecommerce_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_integraciones_ecommerce_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_integraciones_ecommerce_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      cliente_links_pago: {
        Row: {
          cliente_legajo: string
          comercio_id: string | null
          comercio_nombre: string
          created_at: string
          estado: string | null
          expira_en: string | null
          id: string
          metodos_pago: Json | null
          monto: number | null
          notas: string | null
          pagos: number
          pagos_parciales: boolean
          referencia: string | null
          url: string | null
          vistas: number
        }
        Insert: {
          cliente_legajo: string
          comercio_id?: string | null
          comercio_nombre: string
          created_at?: string
          estado?: string | null
          expira_en?: string | null
          id?: string
          metodos_pago?: Json | null
          monto?: number | null
          notas?: string | null
          pagos?: number
          pagos_parciales?: boolean
          referencia?: string | null
          url?: string | null
          vistas?: number
        }
        Update: {
          cliente_legajo?: string
          comercio_id?: string | null
          comercio_nombre?: string
          created_at?: string
          estado?: string | null
          expira_en?: string | null
          id?: string
          metodos_pago?: Json | null
          monto?: number | null
          notas?: string | null
          pagos?: number
          pagos_parciales?: boolean
          referencia?: string | null
          url?: string | null
          vistas?: number
        }
        Relationships: [
          {
            foreignKeyName: "cliente_links_pago_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_links_pago_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_links_pago_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_links_pago_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_links_pago_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_links_pago_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
        ]
      }
      cliente_links_pago_detalle: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          link_id: string
          precio_unitario: number
          producto_id: string | null
          producto_nombre: string
        }
        Insert: {
          cantidad?: number
          created_at?: string
          id?: string
          link_id: string
          precio_unitario?: number
          producto_id?: string | null
          producto_nombre: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          link_id?: string
          precio_unitario?: number
          producto_id?: string | null
          producto_nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_links_pago_detalle_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "cliente_links_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_links_pago_detalle_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_links_pago_pagos: {
        Row: {
          cliente_legajo: string
          created_at: string
          cuotas: number | null
          estado: string
          id: string
          link_id: string
          metodo: string | null
          monto: number
          pagador_email: string | null
          pagador_nombre: string | null
          payway_payment_id: string | null
          payway_status: string | null
          payway_status_detail: string | null
          referencia: string | null
          site_transaction_id: string | null
        }
        Insert: {
          cliente_legajo: string
          created_at?: string
          cuotas?: number | null
          estado?: string
          id?: string
          link_id: string
          metodo?: string | null
          monto?: number
          pagador_email?: string | null
          pagador_nombre?: string | null
          payway_payment_id?: string | null
          payway_status?: string | null
          payway_status_detail?: string | null
          referencia?: string | null
          site_transaction_id?: string | null
        }
        Update: {
          cliente_legajo?: string
          created_at?: string
          cuotas?: number | null
          estado?: string
          id?: string
          link_id?: string
          metodo?: string | null
          monto?: number
          pagador_email?: string | null
          pagador_nombre?: string | null
          payway_payment_id?: string | null
          payway_status?: string | null
          payway_status_detail?: string | null
          referencia?: string | null
          site_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_links_pago_pagos_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "cliente_links_pago"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_modulos: {
        Row: {
          cantidad: number
          clave: string
          cliente_legajo: string
          created_at: string
          detalle: string | null
          id: string
          titulo: string
        }
        Insert: {
          cantidad?: number
          clave: string
          cliente_legajo: string
          created_at?: string
          detalle?: string | null
          id?: string
          titulo: string
        }
        Update: {
          cantidad?: number
          clave?: string
          cliente_legajo?: string
          created_at?: string
          detalle?: string | null
          id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_modulos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_modulos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_modulos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_modulos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      cliente_parametros_alertas: {
        Row: {
          clave: string
          cliente_legajo: string
          created_at: string
          habilitado: boolean
          id: string
          periodo: string | null
          valor: string | null
        }
        Insert: {
          clave: string
          cliente_legajo: string
          created_at?: string
          habilitado?: boolean
          id?: string
          periodo?: string | null
          valor?: string | null
        }
        Update: {
          clave?: string
          cliente_legajo?: string
          created_at?: string
          habilitado?: boolean
          id?: string
          periodo?: string | null
          valor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_parametros_alertas_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_parametros_alertas_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_parametros_alertas_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_parametros_alertas_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      cliente_parametros_bloqueos: {
        Row: {
          clave: string
          cliente_legajo: string
          created_at: string
          habilitado: boolean
          id: string
          periodo: string | null
          valor: string | null
        }
        Insert: {
          clave: string
          cliente_legajo: string
          created_at?: string
          habilitado?: boolean
          id?: string
          periodo?: string | null
          valor?: string | null
        }
        Update: {
          clave?: string
          cliente_legajo?: string
          created_at?: string
          habilitado?: boolean
          id?: string
          periodo?: string | null
          valor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_parametros_bloqueos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_parametros_bloqueos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_parametros_bloqueos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_parametros_bloqueos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      cliente_perfil_riesgo: {
        Row: {
          cliente_legajo: string
          created_at: string
          detalle: Json | null
          evaluado_por: string | null
          id: string
          motivo: string
          nivel: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          cliente_legajo: string
          created_at?: string
          detalle?: Json | null
          evaluado_por?: string | null
          id?: string
          motivo: string
          nivel: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          cliente_legajo?: string
          created_at?: string
          detalle?: Json | null
          evaluado_por?: string | null
          id?: string
          motivo?: string
          nivel?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_perfil_riesgo_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_perfil_riesgo_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_perfil_riesgo_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_perfil_riesgo_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_perfil_riesgo_evaluado_por_fkey"
            columns: ["evaluado_por"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_personas_kyb: {
        Row: {
          apellido: string
          cliente_legajo: string
          created_at: string
          fecha_nacimiento: string
          id: string
          id_numero: string
          id_tipo: string
          nacionalidades: string[]
          nombre: string
          porcentaje: number | null
          rol: string
          updated_at: string
        }
        Insert: {
          apellido: string
          cliente_legajo: string
          created_at?: string
          fecha_nacimiento: string
          id?: string
          id_numero: string
          id_tipo: string
          nacionalidades?: string[]
          nombre: string
          porcentaje?: number | null
          rol: string
          updated_at?: string
        }
        Update: {
          apellido?: string
          cliente_legajo?: string
          created_at?: string
          fecha_nacimiento?: string
          id?: string
          id_numero?: string
          id_tipo?: string
          nacionalidades?: string[]
          nombre?: string
          porcentaje?: number | null
          rol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_personas_kyb_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_personas_kyb_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_personas_kyb_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_personas_kyb_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      cliente_transiciones: {
        Row: {
          admin_user_id: string | null
          cliente_id: string
          comentario: string | null
          created_at: string
          estado_anterior: string | null
          estado_nuevo: string
          id: string
          legajo: string
          origen: string
        }
        Insert: {
          admin_user_id?: string | null
          cliente_id: string
          comentario?: string | null
          created_at?: string
          estado_anterior?: string | null
          estado_nuevo: string
          id?: string
          legajo: string
          origen?: string
        }
        Update: {
          admin_user_id?: string | null
          cliente_id?: string
          comentario?: string | null
          created_at?: string
          estado_anterior?: string | null
          estado_nuevo?: string
          id?: string
          legajo?: string
          origen?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_transiciones_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_transiciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          actividad: string | null
          alias: string | null
          cbu: string | null
          cbu_cancelado: boolean
          ciudad: string | null
          correo: string
          cp: string | null
          created_at: string
          cuenta_bancaria: string | null
          cuenta_bancaria_tipo: string | null
          cuit: string
          cuit_cuil: string | null
          direccion: string | null
          direccion2: string | null
          email_verificado: boolean
          es_pep: boolean
          estado: string
          estado_onboarding: string
          fecha_alta: string
          fecha_inscripcion: string | null
          fecha_nacimiento: string | null
          genero: string | null
          id: string
          id_personal: string | null
          id_personal_tipo: string | null
          industria_cobre: string | null
          legajo: string
          limite_monto_diario: number | null
          limite_ops_diarias: number | null
          limite_transferencia: number | null
          nombre: string
          nombre_fantasia: string | null
          nombre_legal: string | null
          ocupacion: string | null
          onboarding_completo: boolean
          origen_fondos: string | null
          pais: string
          pais_constitucion: string | null
          pais_operacion: string | null
          provincia: string | null
          regimen_fiscal: string | null
          sitio_web: string | null
          tax_id: string | null
          tax_id_tipo: string | null
          telefono: string | null
          tipo_persona: string
          tipo_sociedad: string | null
          updated_at: string
        }
        Insert: {
          actividad?: string | null
          alias?: string | null
          cbu?: string | null
          cbu_cancelado?: boolean
          ciudad?: string | null
          correo: string
          cp?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          cuenta_bancaria_tipo?: string | null
          cuit: string
          cuit_cuil?: string | null
          direccion?: string | null
          direccion2?: string | null
          email_verificado?: boolean
          es_pep?: boolean
          estado?: string
          estado_onboarding?: string
          fecha_alta?: string
          fecha_inscripcion?: string | null
          fecha_nacimiento?: string | null
          genero?: string | null
          id?: string
          id_personal?: string | null
          id_personal_tipo?: string | null
          industria_cobre?: string | null
          legajo: string
          limite_monto_diario?: number | null
          limite_ops_diarias?: number | null
          limite_transferencia?: number | null
          nombre: string
          nombre_fantasia?: string | null
          nombre_legal?: string | null
          ocupacion?: string | null
          onboarding_completo?: boolean
          origen_fondos?: string | null
          pais?: string
          pais_constitucion?: string | null
          pais_operacion?: string | null
          provincia?: string | null
          regimen_fiscal?: string | null
          sitio_web?: string | null
          tax_id?: string | null
          tax_id_tipo?: string | null
          telefono?: string | null
          tipo_persona: string
          tipo_sociedad?: string | null
          updated_at?: string
        }
        Update: {
          actividad?: string | null
          alias?: string | null
          cbu?: string | null
          cbu_cancelado?: boolean
          ciudad?: string | null
          correo?: string
          cp?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          cuenta_bancaria_tipo?: string | null
          cuit?: string
          cuit_cuil?: string | null
          direccion?: string | null
          direccion2?: string | null
          email_verificado?: boolean
          es_pep?: boolean
          estado?: string
          estado_onboarding?: string
          fecha_alta?: string
          fecha_inscripcion?: string | null
          fecha_nacimiento?: string | null
          genero?: string | null
          id?: string
          id_personal?: string | null
          id_personal_tipo?: string | null
          industria_cobre?: string | null
          legajo?: string
          limite_monto_diario?: number | null
          limite_ops_diarias?: number | null
          limite_transferencia?: number | null
          nombre?: string
          nombre_fantasia?: string | null
          nombre_legal?: string | null
          ocupacion?: string | null
          onboarding_completo?: boolean
          origen_fondos?: string | null
          pais?: string
          pais_constitucion?: string | null
          pais_operacion?: string | null
          provincia?: string | null
          regimen_fiscal?: string | null
          sitio_web?: string | null
          tax_id?: string | null
          tax_id_tipo?: string | null
          telefono?: string | null
          tipo_persona?: string
          tipo_sociedad?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_pais_fkey"
            columns: ["pais"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["codigo"]
          },
        ]
      }
      cobre_clabes: {
        Row: {
          clabe: string
          cliente_legajo: string
          created_at: string
          cuenta_id: string
          deshabilitada_at: string | null
          estado: string
          id: string
          modo: string
          referencia_externa_id: string | null
          subcuenta_id: string
        }
        Insert: {
          clabe: string
          cliente_legajo: string
          created_at?: string
          cuenta_id: string
          deshabilitada_at?: string | null
          estado?: string
          id?: string
          modo: string
          referencia_externa_id?: string | null
          subcuenta_id: string
        }
        Update: {
          clabe?: string
          cliente_legajo?: string
          created_at?: string
          cuenta_id?: string
          deshabilitada_at?: string | null
          estado?: string
          id?: string
          modo?: string
          referencia_externa_id?: string | null
          subcuenta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobre_clabes_cuenta_id_fkey"
            columns: ["cuenta_id"]
            isOneToOne: false
            referencedRelation: "cobre_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_clabes_subcuenta_id_fkey"
            columns: ["subcuenta_id"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cobre_clientes: {
        Row: {
          cliente_legajo: string
          modelo_fondos: string
          updated_at: string
        }
        Insert: {
          cliente_legajo: string
          modelo_fondos: string
          updated_at?: string
        }
        Update: {
          cliente_legajo?: string
          modelo_fondos?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobre_clientes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_clientes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: true
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_clientes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: true
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_clientes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: true
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      cobre_cobros_r2p: {
        Row: {
          clabe_dinamica: string | null
          cliente_legajo: string
          codigo: string | null
          concepto: string | null
          contraparte_externa_id: string | null
          created_at: string
          cuenta_destino_externa_id: string
          estado: string
          external_id: string
          id: string
          instancia_id: string | null
          link_id: string | null
          mm_id: string | null
          modo: string
          monto: number
          motivo: string | null
          pagado_at: string | null
          pagador_correo: string | null
          pagador_id_numero: string
          pagador_id_tipo: string
          pagador_nombre: string
          pago_id: string | null
          subcuenta_id: string
          transaccion_externa_id: string | null
          transaction_id: string | null
          updated_at: string
          valido_hasta: string
        }
        Insert: {
          clabe_dinamica?: string | null
          cliente_legajo: string
          codigo?: string | null
          concepto?: string | null
          contraparte_externa_id?: string | null
          created_at?: string
          cuenta_destino_externa_id: string
          estado?: string
          external_id: string
          id?: string
          instancia_id?: string | null
          link_id?: string | null
          mm_id?: string | null
          modo: string
          monto: number
          motivo?: string | null
          pagado_at?: string | null
          pagador_correo?: string | null
          pagador_id_numero: string
          pagador_id_tipo: string
          pagador_nombre: string
          pago_id?: string | null
          subcuenta_id: string
          transaccion_externa_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          valido_hasta: string
        }
        Update: {
          clabe_dinamica?: string | null
          cliente_legajo?: string
          codigo?: string | null
          concepto?: string | null
          contraparte_externa_id?: string | null
          created_at?: string
          cuenta_destino_externa_id?: string
          estado?: string
          external_id?: string
          id?: string
          instancia_id?: string | null
          link_id?: string | null
          mm_id?: string | null
          modo?: string
          monto?: number
          motivo?: string | null
          pagado_at?: string | null
          pagador_correo?: string | null
          pagador_id_numero?: string
          pagador_id_tipo?: string
          pagador_nombre?: string
          pago_id?: string | null
          subcuenta_id?: string
          transaccion_externa_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          valido_hasta?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobre_cobros_r2p_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_cobros_r2p_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_cobros_r2p_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_cobros_r2p_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_cobros_r2p_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "cobre_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_cobros_r2p_subcuenta_id_fkey"
            columns: ["subcuenta_id"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_cobros_r2p_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      cobre_configuracion: {
        Row: {
          conversion_evalua_reglas: boolean
          cuenta_global_id: string | null
          cuenta_plataforma_id: string | null
          cuenta_usa_id: string | null
          exigir_otp: boolean
          id: number
          modelo_default: string
          monto_aprobacion: number | null
          monto_aprobacion_usd: number | null
          updated_at: string
        }
        Insert: {
          conversion_evalua_reglas?: boolean
          cuenta_global_id?: string | null
          cuenta_plataforma_id?: string | null
          cuenta_usa_id?: string | null
          exigir_otp?: boolean
          id?: number
          modelo_default?: string
          monto_aprobacion?: number | null
          monto_aprobacion_usd?: number | null
          updated_at?: string
        }
        Update: {
          conversion_evalua_reglas?: boolean
          cuenta_global_id?: string | null
          cuenta_plataforma_id?: string | null
          cuenta_usa_id?: string | null
          exigir_otp?: boolean
          id?: number
          modelo_default?: string
          monto_aprobacion?: number | null
          monto_aprobacion_usd?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobre_configuracion_cuenta_global_id_fkey"
            columns: ["cuenta_global_id"]
            isOneToOne: false
            referencedRelation: "cobre_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_configuracion_cuenta_plataforma_id_fkey"
            columns: ["cuenta_plataforma_id"]
            isOneToOne: false
            referencedRelation: "cobre_cuentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_configuracion_cuenta_usa_id_fkey"
            columns: ["cuenta_usa_id"]
            isOneToOne: false
            referencedRelation: "cobre_cuentas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobre_contrapartes: {
        Row: {
          alias: string | null
          banco: string | null
          cliente_legajo: string
          contraparte_externa_id: string
          created_at: string
          datos: Json
          geo: string | null
          id: string
          id_numero: string
          id_tipo: string
          modo: string
          numero: string
          rail: string | null
          tipo: string
          titular: string
          verificacion: string
          verificacion_externa_id: string | null
          verificacion_motivo: string | null
          verificado_at: string | null
        }
        Insert: {
          alias?: string | null
          banco?: string | null
          cliente_legajo: string
          contraparte_externa_id: string
          created_at?: string
          datos?: Json
          geo?: string | null
          id?: string
          id_numero: string
          id_tipo: string
          modo: string
          numero: string
          rail?: string | null
          tipo: string
          titular: string
          verificacion?: string
          verificacion_externa_id?: string | null
          verificacion_motivo?: string | null
          verificado_at?: string | null
        }
        Update: {
          alias?: string | null
          banco?: string | null
          cliente_legajo?: string
          contraparte_externa_id?: string
          created_at?: string
          datos?: Json
          geo?: string | null
          id?: string
          id_numero?: string
          id_tipo?: string
          modo?: string
          numero?: string
          rail?: string | null
          tipo?: string
          titular?: string
          verificacion?: string
          verificacion_externa_id?: string | null
          verificacion_motivo?: string | null
          verificado_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobre_contrapartes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_contrapartes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_contrapartes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_contrapartes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      cobre_cruces: {
        Row: {
          cliente_legajo: string
          codigo: string | null
          comision: number
          comisiones: Json
          cotizacion_id: string
          cotizacion_vence_at: string
          created_at: string
          decidida_at: string | null
          decidida_por: string | null
          estado: string
          external_id: string
          fuera_de_mercado: boolean
          id: string
          idempotency: string
          impuesto: number
          mm_id: string | null
          modo: string
          monto_mxn: number
          monto_usd: number
          motivo: string | null
          subcuenta_mxn_id: string
          subcuenta_usd_id: string
          tasa: number
          transaction_mxn_id: string | null
          transaction_usd_id: string | null
          updated_at: string
        }
        Insert: {
          cliente_legajo: string
          codigo?: string | null
          comision?: number
          comisiones?: Json
          cotizacion_id: string
          cotizacion_vence_at: string
          created_at?: string
          decidida_at?: string | null
          decidida_por?: string | null
          estado?: string
          external_id: string
          fuera_de_mercado?: boolean
          id?: string
          idempotency: string
          impuesto?: number
          mm_id?: string | null
          modo: string
          monto_mxn: number
          monto_usd: number
          motivo?: string | null
          subcuenta_mxn_id: string
          subcuenta_usd_id: string
          tasa: number
          transaction_mxn_id?: string | null
          transaction_usd_id?: string | null
          updated_at?: string
        }
        Update: {
          cliente_legajo?: string
          codigo?: string | null
          comision?: number
          comisiones?: Json
          cotizacion_id?: string
          cotizacion_vence_at?: string
          created_at?: string
          decidida_at?: string | null
          decidida_por?: string | null
          estado?: string
          external_id?: string
          fuera_de_mercado?: boolean
          id?: string
          idempotency?: string
          impuesto?: number
          mm_id?: string | null
          modo?: string
          monto_mxn?: number
          monto_usd?: number
          motivo?: string | null
          subcuenta_mxn_id?: string
          subcuenta_usd_id?: string
          tasa?: number
          transaction_mxn_id?: string | null
          transaction_usd_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobre_cruces_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_cruces_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_cruces_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_cruces_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_cruces_subcuenta_mxn_id_fkey"
            columns: ["subcuenta_mxn_id"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_cruces_subcuenta_usd_id_fkey"
            columns: ["subcuenta_usd_id"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_cruces_transaction_mxn_id_fkey"
            columns: ["transaction_mxn_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_cruces_transaction_usd_id_fkey"
            columns: ["transaction_usd_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      cobre_cuentas: {
        Row: {
          alias: string | null
          clabe: string | null
          cliente_legajo: string | null
          conectividad: string | null
          created_at: string
          cuenta_externa_id: string
          estado: string
          id: string
          instancia_id: string | null
          modo: string
          moneda: string
          proveedor_id: string
          subcliente_id: string | null
          subcuenta_id: string | null
          tipo: string
        }
        Insert: {
          alias?: string | null
          clabe?: string | null
          cliente_legajo?: string | null
          conectividad?: string | null
          created_at?: string
          cuenta_externa_id: string
          estado?: string
          id?: string
          instancia_id?: string | null
          modo: string
          moneda?: string
          proveedor_id?: string
          subcliente_id?: string | null
          subcuenta_id?: string | null
          tipo: string
        }
        Update: {
          alias?: string | null
          clabe?: string | null
          cliente_legajo?: string | null
          conectividad?: string | null
          created_at?: string
          cuenta_externa_id?: string
          estado?: string
          id?: string
          instancia_id?: string | null
          modo?: string
          moneda?: string
          proveedor_id?: string
          subcliente_id?: string | null
          subcuenta_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobre_cuentas_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_cuentas_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_cuentas_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_cuentas_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_cuentas_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "cobre_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_cuentas_subcliente_id_fkey"
            columns: ["subcliente_id"]
            isOneToOne: false
            referencedRelation: "cobre_subclientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_cuentas_subcuenta_id_fkey"
            columns: ["subcuenta_id"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cobre_depositos: {
        Row: {
          cep: string | null
          clabe: string | null
          clave_rastreo: string | null
          cliente_legajo: string | null
          cuenta_externa_id: string | null
          devolucion_estado: string | null
          devolucion_mm_id: string | null
          devolucion_motivo: string | null
          devuelto_at: string | null
          estado: string
          fecha_operacion: string | null
          id: string
          modo: string
          monto: number
          origen: string
          recibido_at: string
          remitente: string | null
          remitente_cuenta: string | null
          remitente_id: string | null
          subcuenta_id: string | null
          transaccion_externa_id: string
          transaction_id: string | null
        }
        Insert: {
          cep?: string | null
          clabe?: string | null
          clave_rastreo?: string | null
          cliente_legajo?: string | null
          cuenta_externa_id?: string | null
          devolucion_estado?: string | null
          devolucion_mm_id?: string | null
          devolucion_motivo?: string | null
          devuelto_at?: string | null
          estado: string
          fecha_operacion?: string | null
          id?: string
          modo: string
          monto: number
          origen?: string
          recibido_at?: string
          remitente?: string | null
          remitente_cuenta?: string | null
          remitente_id?: string | null
          subcuenta_id?: string | null
          transaccion_externa_id: string
          transaction_id?: string | null
        }
        Update: {
          cep?: string | null
          clabe?: string | null
          clave_rastreo?: string | null
          cliente_legajo?: string | null
          cuenta_externa_id?: string | null
          devolucion_estado?: string | null
          devolucion_mm_id?: string | null
          devolucion_motivo?: string | null
          devuelto_at?: string | null
          estado?: string
          fecha_operacion?: string | null
          id?: string
          modo?: string
          monto?: number
          origen?: string
          recibido_at?: string
          remitente?: string | null
          remitente_cuenta?: string | null
          remitente_id?: string | null
          subcuenta_id?: string | null
          transaccion_externa_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobre_depositos_subcuenta_id_fkey"
            columns: ["subcuenta_id"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_depositos_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      cobre_instancias: {
        Row: {
          base_url: string | null
          clave_webhook_ref: string | null
          cliente_legajo: string
          created_at: string
          estado: string
          id: string
          modo: string
          secreto_ref: string | null
          suscripcion_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          base_url?: string | null
          clave_webhook_ref?: string | null
          cliente_legajo: string
          created_at?: string
          estado?: string
          id?: string
          modo: string
          secreto_ref?: string | null
          suscripcion_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          base_url?: string | null
          clave_webhook_ref?: string | null
          cliente_legajo?: string
          created_at?: string
          estado?: string
          id?: string
          modo?: string
          secreto_ref?: string | null
          suscripcion_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobre_instancias_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_instancias_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_instancias_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_instancias_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      cobre_lotes: {
        Row: {
          archivo: string
          cantidad: number
          cliente_legajo: string
          created_at: string
          decidida_at: string | null
          decidida_por: string | null
          estado: string
          id: string
          lote_externo_id: string | null
          modo: string
          motivo: string | null
          nota_decision: string | null
          requiere_aprobacion: boolean
          subcuenta_id: string
          total: number
          updated_at: string
        }
        Insert: {
          archivo: string
          cantidad: number
          cliente_legajo: string
          created_at?: string
          decidida_at?: string | null
          decidida_por?: string | null
          estado?: string
          id?: string
          lote_externo_id?: string | null
          modo: string
          motivo?: string | null
          nota_decision?: string | null
          requiere_aprobacion?: boolean
          subcuenta_id: string
          total: number
          updated_at?: string
        }
        Update: {
          archivo?: string
          cantidad?: number
          cliente_legajo?: string
          created_at?: string
          decidida_at?: string | null
          decidida_por?: string | null
          estado?: string
          id?: string
          lote_externo_id?: string | null
          modo?: string
          motivo?: string | null
          nota_decision?: string | null
          requiere_aprobacion?: boolean
          subcuenta_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobre_lotes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_lotes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_lotes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_lotes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_lotes_subcuenta_id_fkey"
            columns: ["subcuenta_id"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cobre_simulador: {
        Row: {
          actualizado_at: string
          creado_at: string
          datos: Json
          id: string
          tipo: string
        }
        Insert: {
          actualizado_at?: string
          creado_at?: string
          datos: Json
          id: string
          tipo: string
        }
        Update: {
          actualizado_at?: string
          creado_at?: string
          datos?: Json
          id?: string
          tipo?: string
        }
        Relationships: []
      }
      cobre_subclientes: {
        Row: {
          balance_pedido_at: string | null
          cliente_legajo: string
          creado_por: string | null
          created_at: string
          datos_enviados: Json
          estado: string
          id: string
          idempotency_key: string
          modo: string
          motivo: string | null
          revocado_at: string | null
          revocado_motivo: string | null
          revocado_revisado: boolean
          subcliente_externo_id: string | null
          updated_at: string
        }
        Insert: {
          balance_pedido_at?: string | null
          cliente_legajo: string
          creado_por?: string | null
          created_at?: string
          datos_enviados: Json
          estado?: string
          id?: string
          idempotency_key: string
          modo: string
          motivo?: string | null
          revocado_at?: string | null
          revocado_motivo?: string | null
          revocado_revisado?: boolean
          subcliente_externo_id?: string | null
          updated_at?: string
        }
        Update: {
          balance_pedido_at?: string | null
          cliente_legajo?: string
          creado_por?: string | null
          created_at?: string
          datos_enviados?: Json
          estado?: string
          id?: string
          idempotency_key?: string
          modo?: string
          motivo?: string | null
          revocado_at?: string | null
          revocado_motivo?: string | null
          revocado_revisado?: boolean
          subcliente_externo_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobre_subclientes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_subclientes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_subclientes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cobre_subclientes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      cobre_suscripciones: {
        Row: {
          created_at: string
          eventos: string[]
          id: string
          instancia_id: string | null
          modo: string
          suscripcion_externa_id: string
          url: string
        }
        Insert: {
          created_at?: string
          eventos: string[]
          id?: string
          instancia_id?: string | null
          modo: string
          suscripcion_externa_id: string
          url: string
        }
        Update: {
          created_at?: string
          eventos?: string[]
          id?: string
          instancia_id?: string | null
          modo?: string
          suscripcion_externa_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobre_suscripciones_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "cobre_instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      cobre_transferencias: {
        Row: {
          aprobacion_externa_id: string | null
          cep: string | null
          clave_rastreo: string | null
          cliente_legajo: string
          codigo: string | null
          concepto: string | null
          contraparte_id: string
          created_at: string
          cuenta_origen_externa_id: string | null
          decidida_at: string | null
          decidida_por: string | null
          devuelta_at: string | null
          estado: string
          id: string
          id_txn: string
          instancia_id: string | null
          lote_id: string | null
          mm_id: string | null
          modo: string
          moneda: string
          monto: number
          motivo: string | null
          nota_decision: string | null
          requiere_aprobacion: boolean
          subcuenta_id: string
          swift_uetr: string | null
          tipo: string
          transaction_id: string | null
          traslado_estado: string | null
          traslado_mm_id: string | null
          updated_at: string
        }
        Insert: {
          aprobacion_externa_id?: string | null
          cep?: string | null
          clave_rastreo?: string | null
          cliente_legajo: string
          codigo?: string | null
          concepto?: string | null
          contraparte_id: string
          created_at?: string
          cuenta_origen_externa_id?: string | null
          decidida_at?: string | null
          decidida_por?: string | null
          devuelta_at?: string | null
          estado?: string
          id?: string
          id_txn: string
          instancia_id?: string | null
          lote_id?: string | null
          mm_id?: string | null
          modo: string
          moneda?: string
          monto: number
          motivo?: string | null
          nota_decision?: string | null
          requiere_aprobacion?: boolean
          subcuenta_id: string
          swift_uetr?: string | null
          tipo?: string
          transaction_id?: string | null
          traslado_estado?: string | null
          traslado_mm_id?: string | null
          updated_at?: string
        }
        Update: {
          aprobacion_externa_id?: string | null
          cep?: string | null
          clave_rastreo?: string | null
          cliente_legajo?: string
          codigo?: string | null
          concepto?: string | null
          contraparte_id?: string
          created_at?: string
          cuenta_origen_externa_id?: string | null
          decidida_at?: string | null
          decidida_por?: string | null
          devuelta_at?: string | null
          estado?: string
          id?: string
          id_txn?: string
          instancia_id?: string | null
          lote_id?: string | null
          mm_id?: string | null
          modo?: string
          moneda?: string
          monto?: number
          motivo?: string | null
          nota_decision?: string | null
          requiere_aprobacion?: boolean
          subcuenta_id?: string
          swift_uetr?: string | null
          tipo?: string
          transaction_id?: string | null
          traslado_estado?: string | null
          traslado_mm_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobre_transferencias_contraparte_id_fkey"
            columns: ["contraparte_id"]
            isOneToOne: false
            referencedRelation: "cobre_contrapartes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_transferencias_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "cobre_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_transferencias_lote_fk"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "cobre_lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_transferencias_subcuenta_id_fkey"
            columns: ["subcuenta_id"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobre_transferencias_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      codigos_categoria: {
        Row: {
          codigo: string
          created_at: string
          descripcion: string | null
          estado: string
          id: number
          nombre: string
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          descripcion?: string | null
          estado?: string
          id?: never
          nombre: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          descripcion?: string | null
          estado?: string
          id?: never
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      codigos_error: {
        Row: {
          activo: boolean
          audiencia: string
          canal_defecto: string
          codigo: string
          created_at: string
          descripcion: string | null
          id: string
          mensaje: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          audiencia?: string
          canal_defecto?: string
          codigo: string
          created_at?: string
          descripcion?: string | null
          id?: string
          mensaje: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          audiencia?: string
          canal_defecto?: string
          codigo?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          mensaje?: string
          updated_at?: string
        }
        Relationships: []
      }
      comercio_banderas: {
        Row: {
          bandera: string
          bandera_id: string | null
          comercio_id: string
          comision_molipay: number
          comision_neta: number | null
          comision_payway: number
          created_at: string
          estado: string
          id: string
          metodo_key: string | null
          updated_at: string
        }
        Insert: {
          bandera: string
          bandera_id?: string | null
          comercio_id: string
          comision_molipay: number
          comision_neta?: number | null
          comision_payway: number
          created_at?: string
          estado?: string
          id?: string
          metodo_key?: string | null
          updated_at?: string
        }
        Update: {
          bandera?: string
          bandera_id?: string | null
          comercio_id?: string
          comision_molipay?: number
          comision_neta?: number | null
          comision_payway?: number
          created_at?: string
          estado?: string
          id?: string
          metodo_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comercio_banderas_bandera_id_fkey"
            columns: ["bandera_id"]
            isOneToOne: false
            referencedRelation: "banderas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comercio_banderas_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comercio_banderas_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
        ]
      }
      comercio_banderas_cuotas: {
        Row: {
          comercio_bandera_id: string
          created_at: string | null
          cuotas: number
          estado: string
          id: string
          tasa_mensual: number
          updated_at: string | null
        }
        Insert: {
          comercio_bandera_id: string
          created_at?: string | null
          cuotas: number
          estado?: string
          id?: string
          tasa_mensual: number
          updated_at?: string | null
        }
        Update: {
          comercio_bandera_id?: string
          created_at?: string | null
          cuotas?: number
          estado?: string
          id?: string
          tasa_mensual?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comercio_banderas_cuotas_comercio_bandera_id_fkey"
            columns: ["comercio_bandera_id"]
            isOneToOne: false
            referencedRelation: "comercio_banderas"
            referencedColumns: ["id"]
          },
        ]
      }
      comercio_establecimientos: {
        Row: {
          comercio_id: string
          created_at: string
          establecimiento: string
          id: string
          marca: string
          updated_at: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          comercio_id: string
          created_at?: string
          establecimiento: string
          id?: string
          marca: string
          updated_at?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Update: {
          comercio_id?: string
          created_at?: string
          establecimiento?: string
          id?: string
          marca?: string
          updated_at?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comercio_establecimientos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comercio_establecimientos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
        ]
      }
      comercio_proveedores: {
        Row: {
          cobro_comision: string | null
          comercio_id: string
          comision_fija: number | null
          comision_pct: number | null
          conectado_at: string | null
          created_at: string
          cuenta_externa_id: string | null
          entorno: string
          estado: string
          id: string
          modelo_fondos: string | null
          proveedor: string
          public_id: string | null
          revocado_at: string | null
          scopes: string[]
          secreto_ref: string | null
          ultimo_error: string | null
          updated_at: string
        }
        Insert: {
          cobro_comision?: string | null
          comercio_id: string
          comision_fija?: number | null
          comision_pct?: number | null
          conectado_at?: string | null
          created_at?: string
          cuenta_externa_id?: string | null
          entorno?: string
          estado?: string
          id?: string
          modelo_fondos?: string | null
          proveedor: string
          public_id?: string | null
          revocado_at?: string | null
          scopes?: string[]
          secreto_ref?: string | null
          ultimo_error?: string | null
          updated_at?: string
        }
        Update: {
          cobro_comision?: string | null
          comercio_id?: string
          comision_fija?: number | null
          comision_pct?: number | null
          conectado_at?: string | null
          created_at?: string
          cuenta_externa_id?: string | null
          entorno?: string
          estado?: string
          id?: string
          modelo_fondos?: string | null
          proveedor?: string
          public_id?: string | null
          revocado_at?: string | null
          scopes?: string[]
          secreto_ref?: string | null
          ultimo_error?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comercio_proveedores_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comercio_proveedores_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
          {
            foreignKeyName: "comercio_proveedores_proveedor_fkey"
            columns: ["proveedor"]
            isOneToOne: false
            referencedRelation: "proveedores_pago"
            referencedColumns: ["codigo"]
          },
        ]
      }
      comercios: {
        Row: {
          categoria_id: number | null
          created_at: string
          ejecutivo_responsable_id: string | null
          estado: string
          id: string
          legajo: string
          nivel: string
          nombre_comercio: string | null
          pais: string
          site_id: string | null
          updated_at: string
          usuario: string
        }
        Insert: {
          categoria_id?: number | null
          created_at?: string
          ejecutivo_responsable_id?: string | null
          estado: string
          id?: string
          legajo: string
          nivel: string
          nombre_comercio?: string | null
          pais?: string
          site_id?: string | null
          updated_at?: string
          usuario: string
        }
        Update: {
          categoria_id?: number | null
          created_at?: string
          ejecutivo_responsable_id?: string | null
          estado?: string
          id?: string
          legajo?: string
          nivel?: string
          nombre_comercio?: string | null
          pais?: string
          site_id?: string | null
          updated_at?: string
          usuario?: string
        }
        Relationships: [
          {
            foreignKeyName: "comercios_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "codigos_categoria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comercios_ejecutivo_responsable_id_fkey"
            columns: ["ejecutivo_responsable_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comercios_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "comercios_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "comercios_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "comercios_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "comercios_pais_fkey"
            columns: ["pais"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["codigo"]
          },
        ]
      }
      comisiones_cliente: {
        Row: {
          cliente_id: string
          created_at: string
          descripcion: string | null
          estado: string
          id: string
          modalidad: string
          monto_fijo: number | null
          operacion: string
          porcentaje: number | null
          porcentaje_impuesto: number
          subcuenta_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          descripcion?: string | null
          estado?: string
          id?: string
          modalidad?: string
          monto_fijo?: number | null
          operacion: string
          porcentaje?: number | null
          porcentaje_impuesto?: number
          subcuenta_id?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          descripcion?: string | null
          estado?: string
          id?: string
          modalidad?: string
          monto_fijo?: number | null
          operacion?: string
          porcentaje?: number | null
          porcentaje_impuesto?: number
          subcuenta_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comisiones_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comisiones_cliente_subcuenta_id_fkey"
            columns: ["subcuenta_id"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliacion_proveedor_diferencias: {
        Row: {
          conciliacion_id: string
          conexion_id: string | null
          created_at: string
          detalle: Json
          id: string
          nota: string | null
          orden_id: string | null
          pago_id: string | null
          resuelta: boolean
          resuelta_at: string | null
          resuelta_por: string | null
          tipo: string
          transaccion_id: string | null
        }
        Insert: {
          conciliacion_id: string
          conexion_id?: string | null
          created_at?: string
          detalle?: Json
          id?: string
          nota?: string | null
          orden_id?: string | null
          pago_id?: string | null
          resuelta?: boolean
          resuelta_at?: string | null
          resuelta_por?: string | null
          tipo: string
          transaccion_id?: string | null
        }
        Update: {
          conciliacion_id?: string
          conexion_id?: string | null
          created_at?: string
          detalle?: Json
          id?: string
          nota?: string | null
          orden_id?: string | null
          pago_id?: string | null
          resuelta?: boolean
          resuelta_at?: string | null
          resuelta_por?: string | null
          tipo?: string
          transaccion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conciliacion_proveedor_diferencias_conciliacion_id_fkey"
            columns: ["conciliacion_id"]
            isOneToOne: false
            referencedRelation: "conciliaciones_proveedor"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_proveedor_diferencias_conexion_id_fkey"
            columns: ["conexion_id"]
            isOneToOne: false
            referencedRelation: "comercio_proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conciliacion_proveedor_diferencias_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliaciones: {
        Row: {
          archivo_origen: string | null
          created_at: string
          estado_conciliacion: string
          fecha_conciliacion: string | null
          id: string
          monto_diferencia: number | null
          movimiento_id: string
        }
        Insert: {
          archivo_origen?: string | null
          created_at?: string
          estado_conciliacion?: string
          fecha_conciliacion?: string | null
          id?: string
          monto_diferencia?: number | null
          movimiento_id: string
        }
        Update: {
          archivo_origen?: string | null
          created_at?: string
          estado_conciliacion?: string
          fecha_conciliacion?: string | null
          id?: string
          monto_diferencia?: number | null
          movimiento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conciliaciones_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliaciones_archivos: {
        Row: {
          archivo_origen: string | null
          created_at: string
          created_by: string | null
          estado: string
          fecha_carga: string
          id: string
          nombre_archivo: string
          storage_path: string | null
          tipo: string
        }
        Insert: {
          archivo_origen?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          fecha_carga: string
          id?: string
          nombre_archivo: string
          storage_path?: string | null
          tipo?: string
        }
        Update: {
          archivo_origen?: string | null
          created_at?: string
          created_by?: string | null
          estado?: string
          fecha_carga?: string
          id?: string
          nombre_archivo?: string
          storage_path?: string | null
          tipo?: string
        }
        Relationships: []
      }
      conciliaciones_proveedor: {
        Row: {
          desde: string
          ejecutada_at: string
          error: string | null
          hasta: string
          id: string
          origen: string
          proveedor: string
          resumen: Json
        }
        Insert: {
          desde: string
          ejecutada_at?: string
          error?: string | null
          hasta: string
          id?: string
          origen: string
          proveedor: string
          resumen?: Json
        }
        Update: {
          desde?: string
          ejecutada_at?: string
          error?: string | null
          hasta?: string
          id?: string
          origen?: string
          proveedor?: string
          resumen?: Json
        }
        Relationships: [
          {
            foreignKeyName: "conciliaciones_proveedor_proveedor_fkey"
            columns: ["proveedor"]
            isOneToOne: false
            referencedRelation: "proveedores_pago"
            referencedColumns: ["codigo"]
          },
        ]
      }
      configuracion_pagos: {
        Row: {
          cobro_comision: string
          comision_fija: number
          comision_pct: number
          iva_comision_pct: number
          modelo_fondos: string
          pais: string
          proveedor: string
          updated_at: string
        }
        Insert: {
          cobro_comision?: string
          comision_fija?: number
          comision_pct?: number
          iva_comision_pct?: number
          modelo_fondos?: string
          pais: string
          proveedor: string
          updated_at?: string
        }
        Update: {
          cobro_comision?: string
          comision_fija?: number
          comision_pct?: number
          iva_comision_pct?: number
          modelo_fondos?: string
          pais?: string
          proveedor?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracion_pagos_pais_fkey"
            columns: ["pais"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "configuracion_pagos_proveedor_fkey"
            columns: ["proveedor"]
            isOneToOne: false
            referencedRelation: "proveedores_pago"
            referencedColumns: ["codigo"]
          },
        ]
      }
      contracargos: {
        Row: {
          archivos_adjuntos: Json
          cco_origen: string | null
          cliente_legajo: string | null
          comercio_id: string | null
          created_at: string
          created_by: string | null
          documentacion: string | null
          enviado_payway_at: string | null
          es_simulacion: boolean
          estado: string
          fecha_cierre: string | null
          fecha_limite: string | null
          fecha_transaccion: string | null
          id: string
          impacto_cierre: number | null
          impacto_neto: number | null
          impacto_saldo: number | null
          impacto_tasa: number | null
          importe: number
          lote_sugerido_id: string | null
          marca_tarjeta: string | null
          motivo_payway: string | null
          movimiento_id: string | null
          nro_tarjeta_masked: string | null
          pago_id: string | null
          resolucion: string | null
          resuelto_por: string | null
          site_id: string | null
          site_transaction_id: string | null
          ticket_payway: string | null
          updated_at: string
          url_origen: string | null
        }
        Insert: {
          archivos_adjuntos?: Json
          cco_origen?: string | null
          cliente_legajo?: string | null
          comercio_id?: string | null
          created_at?: string
          created_by?: string | null
          documentacion?: string | null
          enviado_payway_at?: string | null
          es_simulacion?: boolean
          estado?: string
          fecha_cierre?: string | null
          fecha_limite?: string | null
          fecha_transaccion?: string | null
          id?: string
          impacto_cierre?: number | null
          impacto_neto?: number | null
          impacto_saldo?: number | null
          impacto_tasa?: number | null
          importe?: number
          lote_sugerido_id?: string | null
          marca_tarjeta?: string | null
          motivo_payway?: string | null
          movimiento_id?: string | null
          nro_tarjeta_masked?: string | null
          pago_id?: string | null
          resolucion?: string | null
          resuelto_por?: string | null
          site_id?: string | null
          site_transaction_id?: string | null
          ticket_payway?: string | null
          updated_at?: string
          url_origen?: string | null
        }
        Update: {
          archivos_adjuntos?: Json
          cco_origen?: string | null
          cliente_legajo?: string | null
          comercio_id?: string | null
          created_at?: string
          created_by?: string | null
          documentacion?: string | null
          enviado_payway_at?: string | null
          es_simulacion?: boolean
          estado?: string
          fecha_cierre?: string | null
          fecha_limite?: string | null
          fecha_transaccion?: string | null
          id?: string
          impacto_cierre?: number | null
          impacto_neto?: number | null
          impacto_saldo?: number | null
          impacto_tasa?: number | null
          importe?: number
          lote_sugerido_id?: string | null
          marca_tarjeta?: string | null
          motivo_payway?: string | null
          movimiento_id?: string | null
          nro_tarjeta_masked?: string | null
          pago_id?: string | null
          resolucion?: string | null
          resuelto_por?: string | null
          site_id?: string | null
          site_transaction_id?: string | null
          ticket_payway?: string | null
          updated_at?: string
          url_origen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracargos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracargos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
          {
            foreignKeyName: "contracargos_lote_sugerido_id_fkey"
            columns: ["lote_sugerido_id"]
            isOneToOne: false
            referencedRelation: "lotes_acreditacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracargos_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracargos_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "cliente_links_pago_pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracargos_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      contracargos_proveedor: {
        Row: {
          cliente_legajo: string | null
          created_at: string
          estado: string
          id: string
          id_externo: string
          moneda: string | null
          monto: number | null
          motivo: string | null
          orden_id: string | null
          pago_id: string | null
          payload: Json
          proveedor: string
          transaccion_id: string | null
          updated_at: string
          vence_at: string | null
        }
        Insert: {
          cliente_legajo?: string | null
          created_at?: string
          estado: string
          id?: string
          id_externo: string
          moneda?: string | null
          monto?: number | null
          motivo?: string | null
          orden_id?: string | null
          pago_id?: string | null
          payload?: Json
          proveedor: string
          transaccion_id?: string | null
          updated_at?: string
          vence_at?: string | null
        }
        Update: {
          cliente_legajo?: string | null
          created_at?: string
          estado?: string
          id?: string
          id_externo?: string
          moneda?: string | null
          monto?: number | null
          motivo?: string | null
          orden_id?: string | null
          pago_id?: string | null
          payload?: Json
          proveedor?: string
          transaccion_id?: string | null
          updated_at?: string
          vence_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracargos_proveedor_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracargos_proveedor_proveedor_fkey"
            columns: ["proveedor"]
            isOneToOne: false
            referencedRelation: "proveedores_pago"
            referencedColumns: ["codigo"]
          },
        ]
      }
      dc_excepciones: {
        Row: {
          archivo_certificado: string | null
          autorizacion_codigo: string | null
          cuit: string
          direccion: string
          estado: string
          fecha_actualizacion: string
          fecha_creacion: string
          id: string
          impuesto_id: string | null
          motivo: string | null
          tipo: string
          usuario: string
          vigencia_desde: string | null
          vigencia_hasta: string | null
        }
        Insert: {
          archivo_certificado?: string | null
          autorizacion_codigo?: string | null
          cuit: string
          direccion: string
          estado: string
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: string
          impuesto_id?: string | null
          motivo?: string | null
          tipo: string
          usuario: string
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Update: {
          archivo_certificado?: string | null
          autorizacion_codigo?: string | null
          cuit?: string
          direccion?: string
          estado?: string
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: string
          impuesto_id?: string | null
          motivo?: string | null
          tipo?: string
          usuario?: string
          vigencia_desde?: string | null
          vigencia_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dc_excepciones_impuesto_id_fkey"
            columns: ["impuesto_id"]
            isOneToOne: false
            referencedRelation: "impuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      dc_sync_retroactivo: {
        Row: {
          aplicado: boolean
          created_at: string
          cuit: string
          desde: string | null
          hasta: string | null
          id: string
          preview_json: Json | null
        }
        Insert: {
          aplicado?: boolean
          created_at?: string
          cuit: string
          desde?: string | null
          hasta?: string | null
          id?: string
          preview_json?: Json | null
        }
        Update: {
          aplicado?: boolean
          created_at?: string
          cuit?: string
          desde?: string | null
          hasta?: string | null
          id?: string
          preview_json?: Json | null
        }
        Relationships: []
      }
      destinatarios_frecuentes: {
        Row: {
          alias: string | null
          banco: string | null
          cbu: string | null
          cliente_legajo: string
          created_at: string
          cuit: string | null
          id: string
          identifier: string
          identifier_kind: string
          nombre: string
        }
        Insert: {
          alias?: string | null
          banco?: string | null
          cbu?: string | null
          cliente_legajo: string
          created_at?: string
          cuit?: string | null
          id?: string
          identifier: string
          identifier_kind: string
          nombre: string
        }
        Update: {
          alias?: string | null
          banco?: string | null
          cbu?: string | null
          cliente_legajo?: string
          created_at?: string
          cuit?: string | null
          id?: string
          identifier?: string
          identifier_kind?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "destinatarios_frecuentes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "destinatarios_frecuentes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "destinatarios_frecuentes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "destinatarios_frecuentes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      deudas_comercio: {
        Row: {
          cliente_legajo: string
          created_at: string
          id: string
          lote_acreditacion_id: string | null
          monto: number
          observaciones: string | null
          origen: string
          saldada: boolean
          saldada_en: string | null
          updated_at: string
        }
        Insert: {
          cliente_legajo: string
          created_at?: string
          id?: string
          lote_acreditacion_id?: string | null
          monto?: number
          observaciones?: string | null
          origen: string
          saldada?: boolean
          saldada_en?: string | null
          updated_at?: string
        }
        Update: {
          cliente_legajo?: string
          created_at?: string
          id?: string
          lote_acreditacion_id?: string | null
          monto?: number
          observaciones?: string | null
          origen?: string
          saldada?: boolean
          saldada_en?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deudas_comercio_lote_acreditacion_id_fkey"
            columns: ["lote_acreditacion_id"]
            isOneToOne: false
            referencedRelation: "lotes_acreditacion"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          cliente_legajo: string
          created_at: string
          id: string
          label: string
          tipo: string
          url: string | null
        }
        Insert: {
          cliente_legajo: string
          created_at?: string
          id?: string
          label?: string
          tipo: string
          url?: string | null
        }
        Update: {
          cliente_legajo?: string
          created_at?: string
          id?: string
          label?: string
          tipo?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "documentos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "documentos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "documentos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      estados_movimiento: {
        Row: {
          codigo: string
          created_at: string
          es_final: boolean
          id: number
          nombre: string
          requiere_conciliacion: boolean
        }
        Insert: {
          codigo: string
          created_at?: string
          es_final?: boolean
          id: number
          nombre: string
          requiere_conciliacion?: boolean
        }
        Update: {
          codigo?: string
          created_at?: string
          es_final?: boolean
          id?: number
          nombre?: string
          requiere_conciliacion?: boolean
        }
        Relationships: []
      }
      estados_por_tipo: {
        Row: {
          estado_id: number
          tipo_movimiento: string
        }
        Insert: {
          estado_id: number
          tipo_movimiento: string
        }
        Update: {
          estado_id?: number
          tipo_movimiento?: string
        }
        Relationships: [
          {
            foreignKeyName: "estados_por_tipo_estado_id_fkey"
            columns: ["estado_id"]
            isOneToOne: false
            referencedRelation: "estados_movimiento"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_notificacion: {
        Row: {
          audiencia: string
          canal: string
          codigo_error_id: string | null
          created_at: string
          estado_entrega: string
          fecha: string
          id: string
          mensaje: string
          metadata: Json | null
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          audiencia: string
          canal: string
          codigo_error_id?: string | null
          created_at?: string
          estado_entrega?: string
          fecha?: string
          id?: string
          mensaje: string
          metadata?: Json | null
          tipo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          audiencia?: string
          canal?: string
          codigo_error_id?: string | null
          created_at?: string
          estado_entrega?: string
          fecha?: string
          id?: string
          mensaje?: string
          metadata?: Json | null
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_notificacion_codigo_error_id_fkey"
            columns: ["codigo_error_id"]
            isOneToOne: false
            referencedRelation: "codigos_error"
            referencedColumns: ["id"]
          },
        ]
      }
      feriados: {
        Row: {
          descripcion: string
          fecha: string
          pais: string
        }
        Insert: {
          descripcion: string
          fecha: string
          pais: string
        }
        Update: {
          descripcion?: string
          fecha?: string
          pais?: string
        }
        Relationships: [
          {
            foreignKeyName: "feriados_pais_fkey"
            columns: ["pais"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["codigo"]
          },
        ]
      }
      historial_cambios: {
        Row: {
          campo: string
          cliente_legajo: string
          created_at: string
          fecha: string
          hora: string | null
          id: string
          usuario: string | null
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          campo: string
          cliente_legajo: string
          created_at?: string
          fecha?: string
          hora?: string | null
          id?: string
          usuario?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          campo?: string
          cliente_legajo?: string
          created_at?: string
          fecha?: string
          hora?: string | null
          id?: string
          usuario?: string | null
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historial_cambios_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "historial_cambios_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "historial_cambios_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "historial_cambios_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      ib_normalizacion_preview: {
        Row: {
          aplicado: boolean
          creados_json: Json | null
          created_at: string
          desactivados_json: Json | null
          id: string
          kpis_json: Json | null
          omitidos_json: Json | null
          padron_id: string
        }
        Insert: {
          aplicado?: boolean
          creados_json?: Json | null
          created_at?: string
          desactivados_json?: Json | null
          id?: string
          kpis_json?: Json | null
          omitidos_json?: Json | null
          padron_id: string
        }
        Update: {
          aplicado?: boolean
          creados_json?: Json | null
          created_at?: string
          desactivados_json?: Json | null
          id?: string
          kpis_json?: Json | null
          omitidos_json?: Json | null
          padron_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ib_normalizacion_preview_padron_id_fkey"
            columns: ["padron_id"]
            isOneToOne: false
            referencedRelation: "ib_padrones"
            referencedColumns: ["id"]
          },
        ]
      }
      ib_padrones: {
        Row: {
          archivo: string | null
          created_at: string
          estado: string
          id: string
          impuesto_id: string | null
          nombre: string
          progreso: number
        }
        Insert: {
          archivo?: string | null
          created_at?: string
          estado: string
          id?: string
          impuesto_id?: string | null
          nombre: string
          progreso?: number
        }
        Update: {
          archivo?: string | null
          created_at?: string
          estado?: string
          id?: string
          impuesto_id?: string | null
          nombre?: string
          progreso?: number
        }
        Relationships: [
          {
            foreignKeyName: "ib_padrones_impuesto_id_fkey"
            columns: ["impuesto_id"]
            isOneToOne: false
            referencedRelation: "impuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      impuestos: {
        Row: {
          ambito: string
          codigo: string
          created_at: string
          descripcion: string | null
          estado: string
          id: string
          monto: number | null
          nombre: string
          periodicidad_dias: number | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ambito?: string
          codigo: string
          created_at?: string
          descripcion?: string | null
          estado: string
          id?: string
          monto?: number | null
          nombre: string
          periodicidad_dias?: number | null
          tipo: string
          updated_at?: string
        }
        Update: {
          ambito?: string
          codigo?: string
          created_at?: string
          descripcion?: string | null
          estado?: string
          id?: string
          monto?: number | null
          nombre?: string
          periodicidad_dias?: number | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      impuestos_alicuotas: {
        Row: {
          codigo: string
          created_at: string
          descripcion: string | null
          estado: string
          id: string
          impuesto_id: string
          tasa: number
        }
        Insert: {
          codigo: string
          created_at?: string
          descripcion?: string | null
          estado: string
          id?: string
          impuesto_id: string
          tasa: number
        }
        Update: {
          codigo?: string
          created_at?: string
          descripcion?: string | null
          estado?: string
          id?: string
          impuesto_id?: string
          tasa?: number
        }
        Relationships: [
          {
            foreignKeyName: "impuestos_alicuotas_impuesto_id_fkey"
            columns: ["impuesto_id"]
            isOneToOne: false
            referencedRelation: "impuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      impuestos_asignaciones: {
        Row: {
          estado: string
          fecha_asignacion: string
          id: string
          impuesto_id: string
          legajo: string
          monto: number
          tipo: string
          tipo_operacion: string | null
        }
        Insert: {
          estado: string
          fecha_asignacion?: string
          id?: string
          impuesto_id: string
          legajo: string
          monto: number
          tipo: string
          tipo_operacion?: string | null
        }
        Update: {
          estado?: string
          fecha_asignacion?: string
          id?: string
          impuesto_id?: string
          legajo?: string
          monto?: number
          tipo?: string
          tipo_operacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impuestos_asignaciones_impuesto_id_fkey"
            columns: ["impuesto_id"]
            isOneToOne: false
            referencedRelation: "impuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impuestos_asignaciones_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "impuestos_asignaciones_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "impuestos_asignaciones_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "impuestos_asignaciones_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      integraciones: {
        Row: {
          created_at: string
          id: string
          nombre: string
          proveedor: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          proveedor: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          proveedor?: string
        }
        Relationships: []
      }
      ledger_accounts: {
        Row: {
          account_code: string
          account_type: string
          balance_bucket: string | null
          created_at: string
          currency_code: string
          id: string
          is_active: boolean
          name: string
          subaccount_id: string | null
        }
        Insert: {
          account_code: string
          account_type: string
          balance_bucket?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          name: string
          subaccount_id?: string | null
        }
        Update: {
          account_code?: string
          account_type?: string
          balance_bucket?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          name?: string
          subaccount_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_accounts_subaccount_id_fkey"
            columns: ["subaccount_id"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string
          amount: number
          concepto: string
          created_at: string
          created_by: string | null
          currency_code: string
          entry_type: string
          id: string
          line_no: number
          memo: string | null
          posted_at: string | null
          posting_key: string
          reversal_of_entry_id: string | null
          transaction_id: string
        }
        Insert: {
          account_id: string
          amount: number
          concepto?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          entry_type: string
          id?: string
          line_no: number
          memo?: string | null
          posted_at?: string | null
          posting_key: string
          reversal_of_entry_id?: string | null
          transaction_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          concepto?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          entry_type?: string
          id?: string
          line_no?: number
          memo?: string | null
          posted_at?: string | null
          posting_key?: string
          reversal_of_entry_id?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "ledger_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_reversal_of_entry_id_fkey"
            columns: ["reversal_of_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
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
      liquidaciones_importaciones: {
        Row: {
          applied_at: string | null
          archivo_hash: string
          archivo_nombre: string
          created_at: string
          estado: string
          id: string
          observaciones: string | null
          resumen: Json | null
          updated_at: string
          uploaded_por: string | null
        }
        Insert: {
          applied_at?: string | null
          archivo_hash: string
          archivo_nombre: string
          created_at?: string
          estado?: string
          id?: string
          observaciones?: string | null
          resumen?: Json | null
          updated_at?: string
          uploaded_por?: string | null
        }
        Update: {
          applied_at?: string | null
          archivo_hash?: string
          archivo_nombre?: string
          created_at?: string
          estado?: string
          id?: string
          observaciones?: string | null
          resumen?: Json | null
          updated_at?: string
          uploaded_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_importaciones_uploaded_por_fkey"
            columns: ["uploaded_por"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidaciones_renglones: {
        Row: {
          comercio_id: string | null
          comision_cierre_monto: number | null
          comision_molipay_monto: number | null
          comision_payway_monto: number | null
          costo_servicio: number
          created_at: string
          diferencia_bruto: number | null
          establecimiento: string
          establecimiento_id: string | null
          estado: string
          fecha: string
          id: string
          importacion_id: string
          importe_neto_final: number | null
          impuestos: number
          lote_acreditacion_id: string | null
          marca: string
          motivo_excepcion: string | null
          nro_renglon: number
          total_bruto: number
          total_neto: number
          updated_at: string
        }
        Insert: {
          comercio_id?: string | null
          comision_cierre_monto?: number | null
          comision_molipay_monto?: number | null
          comision_payway_monto?: number | null
          costo_servicio?: number
          created_at?: string
          diferencia_bruto?: number | null
          establecimiento: string
          establecimiento_id?: string | null
          estado?: string
          fecha: string
          id?: string
          importacion_id: string
          importe_neto_final?: number | null
          impuestos?: number
          lote_acreditacion_id?: string | null
          marca: string
          motivo_excepcion?: string | null
          nro_renglon: number
          total_bruto?: number
          total_neto?: number
          updated_at?: string
        }
        Update: {
          comercio_id?: string | null
          comision_cierre_monto?: number | null
          comision_molipay_monto?: number | null
          comision_payway_monto?: number | null
          costo_servicio?: number
          created_at?: string
          diferencia_bruto?: number | null
          establecimiento?: string
          establecimiento_id?: string | null
          estado?: string
          fecha?: string
          id?: string
          importacion_id?: string
          importe_neto_final?: number | null
          impuestos?: number
          lote_acreditacion_id?: string | null
          marca?: string
          motivo_excepcion?: string | null
          nro_renglon?: number
          total_bruto?: number
          total_neto?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_renglones_comercio_fk"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_renglones_comercio_fk"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
          {
            foreignKeyName: "liquidaciones_renglones_establecimiento_fk"
            columns: ["establecimiento_id"]
            isOneToOne: false
            referencedRelation: "comercio_establecimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_renglones_importacion_fk"
            columns: ["importacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones_importaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_renglones_lote_fk"
            columns: ["lote_acreditacion_id"]
            isOneToOne: false
            referencedRelation: "lotes_acreditacion"
            referencedColumns: ["id"]
          },
        ]
      }
      lote_movimientos: {
        Row: {
          lote_id: string
          movimiento_id: string
        }
        Insert: {
          lote_id: string
          movimiento_id: string
        }
        Update: {
          lote_id?: string
          movimiento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lote_movimientos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes_acreditacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lote_movimientos_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      lote_registros: {
        Row: {
          cbu_id: string | null
          created_at: string
          descripcion: string
          email: string | null
          email_enviado: boolean
          estado: string
          fecha_pago: string | null
          fecha_venc_1: string | null
          fecha_venc_2: string | null
          fecha_venc_3: string | null
          id: string
          id_entidad: string
          id_unico_beneficiario: string | null
          identificacion_usuario: string
          link_de_pago: string | null
          lote_id: string
          medios_pago: Json | null
          monto: number
          monto_pagado: number
          pagos_parciales: boolean | null
          periodo_facturacion: string | null
          sub_entidad: string
          tasa_interes: number | null
          tipo_entidad: string
        }
        Insert: {
          cbu_id?: string | null
          created_at?: string
          descripcion?: string
          email?: string | null
          email_enviado?: boolean
          estado?: string
          fecha_pago?: string | null
          fecha_venc_1?: string | null
          fecha_venc_2?: string | null
          fecha_venc_3?: string | null
          id: string
          id_entidad: string
          id_unico_beneficiario?: string | null
          identificacion_usuario: string
          link_de_pago?: string | null
          lote_id: string
          medios_pago?: Json | null
          monto: number
          monto_pagado?: number
          pagos_parciales?: boolean | null
          periodo_facturacion?: string | null
          sub_entidad: string
          tasa_interes?: number | null
          tipo_entidad: string
        }
        Update: {
          cbu_id?: string | null
          created_at?: string
          descripcion?: string
          email?: string | null
          email_enviado?: boolean
          estado?: string
          fecha_pago?: string | null
          fecha_venc_1?: string | null
          fecha_venc_2?: string | null
          fecha_venc_3?: string | null
          id?: string
          id_entidad?: string
          id_unico_beneficiario?: string | null
          identificacion_usuario?: string
          link_de_pago?: string | null
          lote_id?: string
          medios_pago?: Json | null
          monto?: number
          monto_pagado?: number
          pagos_parciales?: boolean | null
          periodo_facturacion?: string | null
          sub_entidad?: string
          tasa_interes?: number | null
          tipo_entidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "lote_registros_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          cliente_legajo: string
          created_at: string
          dia_pago: number
          estado: string
          fecha_finalizacion: string | null
          fecha_inicio: string | null
          fecha_venc_1: string
          fecha_venc_2: string | null
          fecha_venc_3: string | null
          id: string
          medios_pago: Json
          nombre: string
          notificaciones: boolean
          pagos_parciales: boolean
          periodo: string
          tasa_interes: number
        }
        Insert: {
          cliente_legajo: string
          created_at?: string
          dia_pago?: number
          estado?: string
          fecha_finalizacion?: string | null
          fecha_inicio?: string | null
          fecha_venc_1: string
          fecha_venc_2?: string | null
          fecha_venc_3?: string | null
          id: string
          medios_pago?: Json
          nombre: string
          notificaciones?: boolean
          pagos_parciales?: boolean
          periodo: string
          tasa_interes?: number
        }
        Update: {
          cliente_legajo?: string
          created_at?: string
          dia_pago?: number
          estado?: string
          fecha_finalizacion?: string | null
          fecha_inicio?: string | null
          fecha_venc_1?: string
          fecha_venc_2?: string | null
          fecha_venc_3?: string | null
          id?: string
          medios_pago?: Json
          nombre?: string
          notificaciones?: boolean
          pagos_parciales?: boolean
          periodo?: string
          tasa_interes?: number
        }
        Relationships: [
          {
            foreignKeyName: "lotes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "lotes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "lotes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "lotes_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      lotes_acreditacion: {
        Row: {
          bandera: string
          bandera_id: string | null
          cantidad_operaciones: number
          codigo: string
          comercio_id: string
          comision_cierre_lote_monto: number | null
          comision_cierre_lote_pct: number | null
          contracargo_monto: number
          costo_payway_pago_unico: number | null
          created_at: string
          cuotas: number | null
          debito_credito_monto: number | null
          dias_habiles_aplicados: number | null
          es_estimado: boolean
          estado: string
          fecha: string
          fecha_cobro_real: string | null
          fecha_estimada_recalcular: boolean
          fecha_resolucion: string | null
          id: string
          iibb_monto: number | null
          importe_bruto: number
          importe_neto: number
          impuestos: number
          iva_monto: number | null
          notas_resolucion: string | null
          resuelto_por: string | null
          tasa_molipay_monto: number
          tasa_molipay_pct: number
          tasa_payway_monto: number
          tasa_payway_pct: number
          updated_at: string
        }
        Insert: {
          bandera: string
          bandera_id?: string | null
          cantidad_operaciones?: number
          codigo: string
          comercio_id: string
          comision_cierre_lote_monto?: number | null
          comision_cierre_lote_pct?: number | null
          contracargo_monto?: number
          costo_payway_pago_unico?: number | null
          created_at?: string
          cuotas?: number | null
          debito_credito_monto?: number | null
          dias_habiles_aplicados?: number | null
          es_estimado?: boolean
          estado?: string
          fecha: string
          fecha_cobro_real?: string | null
          fecha_estimada_recalcular?: boolean
          fecha_resolucion?: string | null
          id?: string
          iibb_monto?: number | null
          importe_bruto: number
          importe_neto: number
          impuestos?: number
          iva_monto?: number | null
          notas_resolucion?: string | null
          resuelto_por?: string | null
          tasa_molipay_monto: number
          tasa_molipay_pct: number
          tasa_payway_monto: number
          tasa_payway_pct: number
          updated_at?: string
        }
        Update: {
          bandera?: string
          bandera_id?: string | null
          cantidad_operaciones?: number
          codigo?: string
          comercio_id?: string
          comision_cierre_lote_monto?: number | null
          comision_cierre_lote_pct?: number | null
          contracargo_monto?: number
          costo_payway_pago_unico?: number | null
          created_at?: string
          cuotas?: number | null
          debito_credito_monto?: number | null
          dias_habiles_aplicados?: number | null
          es_estimado?: boolean
          estado?: string
          fecha?: string
          fecha_cobro_real?: string | null
          fecha_estimada_recalcular?: boolean
          fecha_resolucion?: string | null
          id?: string
          iibb_monto?: number | null
          importe_bruto?: number
          importe_neto?: number
          impuestos?: number
          iva_monto?: number | null
          notas_resolucion?: string | null
          resuelto_por?: string | null
          tasa_molipay_monto?: number
          tasa_molipay_pct?: number
          tasa_payway_monto?: number
          tasa_payway_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_acreditacion_bandera_id_fkey"
            columns: ["bandera_id"]
            isOneToOne: false
            referencedRelation: "banderas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_acreditacion_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_acreditacion_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
          {
            foreignKeyName: "lotes_acreditacion_resuelto_por_fkey"
            columns: ["resuelto_por"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes_venta: {
        Row: {
          bandera: string
          cantidad_operaciones: number
          comercio_id: string
          comision: number
          created_at: string
          fecha: string
          id: string
          importe_bruto: number
          importe_neto: number
          impuestos: number
          updated_at: string
        }
        Insert: {
          bandera: string
          cantidad_operaciones?: number
          comercio_id: string
          comision?: number
          created_at?: string
          fecha: string
          id?: string
          importe_bruto?: number
          importe_neto?: number
          impuestos?: number
          updated_at?: string
        }
        Update: {
          bandera?: string
          cantidad_operaciones?: number
          comercio_id?: string
          comision?: number
          created_at?: string
          fecha?: string
          id?: string
          importe_bruto?: number
          importe_neto?: number
          impuestos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_venta_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_venta_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
        ]
      }
      oauth_estados: {
        Row: {
          comercio_id: string
          creado_at: string
          entorno: string
          proveedor: string
          state: string
          usado_at: string | null
          usuario_id: string
          vence_at: string
          volver_a: string
        }
        Insert: {
          comercio_id: string
          creado_at?: string
          entorno: string
          proveedor: string
          state?: string
          usado_at?: string | null
          usuario_id: string
          vence_at?: string
          volver_a: string
        }
        Update: {
          comercio_id?: string
          creado_at?: string
          entorno?: string
          proveedor?: string
          state?: string
          usado_at?: string | null
          usuario_id?: string
          vence_at?: string
          volver_a?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_estados_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_estados_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
          {
            foreignKeyName: "oauth_estados_proveedor_fkey"
            columns: ["proveedor"]
            isOneToOne: false
            referencedRelation: "proveedores_pago"
            referencedColumns: ["codigo"]
          },
        ]
      }
      otp_transferencias: {
        Row: {
          codigo: string
          correo: string
          created_at: string
          expires_at: string
          id: string
          intentos: number
          usado: boolean
        }
        Insert: {
          codigo: string
          correo: string
          created_at?: string
          expires_at: string
          id?: string
          intentos?: number
          usado?: boolean
        }
        Update: {
          codigo?: string
          correo?: string
          created_at?: string
          expires_at?: string
          id?: string
          intentos?: number
          usado?: boolean
        }
        Relationships: []
      }
      pagos: {
        Row: {
          caja_id: string | null
          cliente_legajo: string | null
          comercio_id: string | null
          comision_proveedor: number | null
          conciliado_at: string | null
          conexion_id: string | null
          created_at: string
          entorno: string
          estado: string
          estado_proveedor: string | null
          id: string
          idempotency_key: string
          link_id: string | null
          link_pago_id: string | null
          metodo: string | null
          moneda: string
          monto: number
          monto_reembolsado: number
          motivo: string | null
          neto_proveedor: number | null
          pagado_at: string | null
          pagador_email: string | null
          pagador_nombre: string | null
          pay_link: string | null
          proveedor: string
          proveedor_orden_id: string | null
          proveedor_pago_id: string | null
          proveedor_transaccion_id: string | null
          referencia: string | null
          referencia_url: string | null
          referencia_vence_at: string | null
          respuesta: Json
          updated_at: string
        }
        Insert: {
          caja_id?: string | null
          cliente_legajo?: string | null
          comercio_id?: string | null
          comision_proveedor?: number | null
          conciliado_at?: string | null
          conexion_id?: string | null
          created_at?: string
          entorno: string
          estado?: string
          estado_proveedor?: string | null
          id?: string
          idempotency_key: string
          link_id?: string | null
          link_pago_id?: string | null
          metodo?: string | null
          moneda: string
          monto: number
          monto_reembolsado?: number
          motivo?: string | null
          neto_proveedor?: number | null
          pagado_at?: string | null
          pagador_email?: string | null
          pagador_nombre?: string | null
          pay_link?: string | null
          proveedor: string
          proveedor_orden_id?: string | null
          proveedor_pago_id?: string | null
          proveedor_transaccion_id?: string | null
          referencia?: string | null
          referencia_url?: string | null
          referencia_vence_at?: string | null
          respuesta?: Json
          updated_at?: string
        }
        Update: {
          caja_id?: string | null
          cliente_legajo?: string | null
          comercio_id?: string | null
          comision_proveedor?: number | null
          conciliado_at?: string | null
          conexion_id?: string | null
          created_at?: string
          entorno?: string
          estado?: string
          estado_proveedor?: string | null
          id?: string
          idempotency_key?: string
          link_id?: string | null
          link_pago_id?: string | null
          metodo?: string | null
          moneda?: string
          monto?: number
          monto_reembolsado?: number
          motivo?: string | null
          neto_proveedor?: number | null
          pagado_at?: string | null
          pagador_email?: string | null
          pagador_nombre?: string | null
          pay_link?: string | null
          proveedor?: string
          proveedor_orden_id?: string | null
          proveedor_pago_id?: string | null
          proveedor_transaccion_id?: string | null
          referencia?: string | null
          referencia_url?: string | null
          referencia_vence_at?: string | null
          respuesta?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
          {
            foreignKeyName: "pagos_conexion_id_fkey"
            columns: ["conexion_id"]
            isOneToOne: false
            referencedRelation: "comercio_proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "cliente_links_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_link_pago_id_fkey"
            columns: ["link_pago_id"]
            isOneToOne: false
            referencedRelation: "cliente_links_pago_pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_proveedor_fkey"
            columns: ["proveedor"]
            isOneToOne: false
            referencedRelation: "proveedores_pago"
            referencedColumns: ["codigo"]
          },
        ]
      }
      pagos_intentos_payway: {
        Row: {
          completed_at: string | null
          created_at: string
          estado_intento: string
          id: string
          link_id: string
          motivo: string | null
          pago_id: string | null
          payway_payment_id: string | null
          payway_status: string | null
          site_transaction_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          estado_intento?: string
          id?: string
          link_id: string
          motivo?: string | null
          pago_id?: string | null
          payway_payment_id?: string | null
          payway_status?: string | null
          site_transaction_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          estado_intento?: string
          id?: string
          link_id?: string
          motivo?: string | null
          pago_id?: string | null
          payway_payment_id?: string | null
          payway_status?: string | null
          site_transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_intentos_payway_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "cliente_links_pago"
            referencedColumns: ["id"]
          },
        ]
      }
      paises: {
        Row: {
          activo: boolean
          codigo: string
          cuenta_bancaria_tipo: string
          locale: string
          modulos: Json
          moneda: string
          nombre: string
          predeterminado: boolean
          prefijo_telefono: string
          tax_id_tipos: string[]
          timezone: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          cuenta_bancaria_tipo: string
          locale: string
          modulos?: Json
          moneda: string
          nombre: string
          predeterminado?: boolean
          prefijo_telefono: string
          tax_id_tipos?: string[]
          timezone: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          cuenta_bancaria_tipo?: string
          locale?: string
          modulos?: Json
          moneda?: string
          nombre?: string
          predeterminado?: boolean
          prefijo_telefono?: string
          tax_id_tipos?: string[]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      parametros_globales: {
        Row: {
          clave: string
          descripcion: string | null
          updated_at: string
          valor: string
        }
        Insert: {
          clave: string
          descripcion?: string | null
          updated_at?: string
          valor: string
        }
        Update: {
          clave?: string
          descripcion?: string | null
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      permisos: {
        Row: {
          id: string
          puede_borrar: boolean
          puede_crear: boolean
          puede_leer: boolean
          puede_modificar: boolean
          recurso_id: string
          rol_id: string
        }
        Insert: {
          id?: string
          puede_borrar?: boolean
          puede_crear?: boolean
          puede_leer?: boolean
          puede_modificar?: boolean
          recurso_id: string
          rol_id: string
        }
        Update: {
          id?: string
          puede_borrar?: boolean
          puede_crear?: boolean
          puede_leer?: boolean
          puede_modificar?: boolean
          recurso_id?: string
          rol_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permisos_recurso_id_fkey"
            columns: ["recurso_id"]
            isOneToOne: false
            referencedRelation: "recursos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permisos_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      plaft_coincidencias: {
        Row: {
          analizada_en: string | null
          analizada_por: string | null
          cliente_id: string
          cliente_nombre: string
          estado: string
          fecha: string
          id: number
          lista_dataid: string
          lista_nombre: string
          lista_origen: string | null
          lista_referencia: string | null
          lista_variante: string | null
          observaciones: string | null
          similitud: number
        }
        Insert: {
          analizada_en?: string | null
          analizada_por?: string | null
          cliente_id: string
          cliente_nombre: string
          estado?: string
          fecha?: string
          id?: number
          lista_dataid: string
          lista_nombre: string
          lista_origen?: string | null
          lista_referencia?: string | null
          lista_variante?: string | null
          observaciones?: string | null
          similitud: number
        }
        Update: {
          analizada_en?: string | null
          analizada_por?: string | null
          cliente_id?: string
          cliente_nombre?: string
          estado?: string
          fecha?: string
          id?: number
          lista_dataid?: string
          lista_nombre?: string
          lista_origen?: string | null
          lista_referencia?: string | null
          lista_variante?: string | null
          observaciones?: string | null
          similitud?: number
        }
        Relationships: []
      }
      plaft_corridas: {
        Row: {
          coincidencias_nuevas: number | null
          duracion_ms: number | null
          error: string | null
          estado: string
          fecha: string
          id: number
          total_clientes: number | null
          total_lista: number | null
          umbral: number | null
        }
        Insert: {
          coincidencias_nuevas?: number | null
          duracion_ms?: number | null
          error?: string | null
          estado: string
          fecha?: string
          id?: number
          total_clientes?: number | null
          total_lista?: number | null
          umbral?: number | null
        }
        Update: {
          coincidencias_nuevas?: number | null
          duracion_ms?: number | null
          error?: string | null
          estado?: string
          fecha?: string
          id?: number
          total_clientes?: number | null
          total_lista?: number | null
          umbral?: number | null
        }
        Relationships: []
      }
      plantillas_transferencia: {
        Row: {
          cliente_legajo: string
          concepto: string | null
          created_at: string
          destinatario_alias: string | null
          destinatario_banco: string | null
          destinatario_cbu: string | null
          destinatario_cuit: string | null
          destinatario_identifier: string | null
          destinatario_kind: string | null
          destinatario_nombre: string | null
          id: string
          monto: number | null
          nombre: string
          subcuenta_origen: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          cliente_legajo: string
          concepto?: string | null
          created_at?: string
          destinatario_alias?: string | null
          destinatario_banco?: string | null
          destinatario_cbu?: string | null
          destinatario_cuit?: string | null
          destinatario_identifier?: string | null
          destinatario_kind?: string | null
          destinatario_nombre?: string | null
          id?: string
          monto?: number | null
          nombre: string
          subcuenta_origen?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Update: {
          cliente_legajo?: string
          concepto?: string | null
          created_at?: string
          destinatario_alias?: string | null
          destinatario_banco?: string | null
          destinatario_cbu?: string | null
          destinatario_cuit?: string | null
          destinatario_identifier?: string | null
          destinatario_kind?: string | null
          destinatario_nombre?: string | null
          id?: string
          monto?: number | null
          nombre?: string
          subcuenta_origen?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plantillas_transferencia_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "plantillas_transferencia_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "plantillas_transferencia_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "plantillas_transferencia_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "plantillas_transferencia_subcuenta_origen_fkey"
            columns: ["subcuenta_origen"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          cantidad: number
          cliente_legajo: string
          created_at: string
          descripcion: string | null
          id: string
          imagen_url: string | null
          moneda: string
          nombre: string
          precio: number
          sku: string | null
        }
        Insert: {
          activo?: boolean
          cantidad?: number
          cliente_legajo: string
          created_at?: string
          descripcion?: string | null
          id?: string
          imagen_url?: string | null
          moneda?: string
          nombre: string
          precio?: number
          sku?: string | null
        }
        Update: {
          activo?: boolean
          cantidad?: number
          cliente_legajo?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          imagen_url?: string | null
          moneda?: string
          nombre?: string
          precio?: number
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "productos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "productos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "productos_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      proveedores_pago: {
        Row: {
          activo: boolean
          codigo: string
          conexion_detalle: Json
          conexion_estado: string
          conexion_verificada_at: string | null
          nombre: string
          pais: string
          sandbox: boolean
          tipos: string[]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          conexion_detalle?: Json
          conexion_estado?: string
          conexion_verificada_at?: string | null
          nombre: string
          pais: string
          sandbox?: boolean
          tipos?: string[]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          conexion_detalle?: Json
          conexion_estado?: string
          conexion_verificada_at?: string | null
          nombre?: string
          pais?: string
          sandbox?: boolean
          tipos?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_pago_pais_fkey"
            columns: ["pais"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["codigo"]
          },
        ]
      }
      puntos_venta: {
        Row: {
          comercio_id: string
          created_at: string
          estado: string
          id: string
          nombre: string
        }
        Insert: {
          comercio_id: string
          created_at?: string
          estado: string
          id?: string
          nombre: string
        }
        Update: {
          comercio_id?: string
          created_at?: string
          estado?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "puntos_venta_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "puntos_venta_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
        ]
      }
      rbac_audit: {
        Row: {
          admin_user_id: string | null
          created_at: string
          datos_antes: Json | null
          datos_despues: Json | null
          fila_id: string | null
          id: string
          operacion: string
          tabla: string
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string
          datos_antes?: Json | null
          datos_despues?: Json | null
          fila_id?: string | null
          id?: string
          operacion: string
          tabla: string
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string
          datos_antes?: Json | null
          datos_despues?: Json | null
          fila_id?: string | null
          id?: string
          operacion?: string
          tabla?: string
        }
        Relationships: []
      }
      recursos: {
        Row: {
          codigo: string
          id: string
          modulo: string | null
          nombre: string
        }
        Insert: {
          codigo: string
          id?: string
          modulo?: string | null
          nombre: string
        }
        Update: {
          codigo?: string
          id?: string
          modulo?: string | null
          nombre?: string
        }
        Relationships: []
      }
      reembolsos: {
        Row: {
          created_at: string
          error: string | null
          estado: string
          finalizado_at: string | null
          id: string
          monto: number
          motivo: string
          nota: string | null
          origen: string
          pago_id: string
          proveedor: string
          proveedor_reembolso_id: string | null
          respuesta: Json
          solicitado_por: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          estado?: string
          finalizado_at?: string | null
          id?: string
          monto: number
          motivo: string
          nota?: string | null
          origen: string
          pago_id: string
          proveedor: string
          proveedor_reembolso_id?: string | null
          respuesta?: Json
          solicitado_por?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          estado?: string
          finalizado_at?: string | null
          id?: string
          monto?: number
          motivo?: string
          nota?: string | null
          origen?: string
          pago_id?: string
          proveedor?: string
          proveedor_reembolso_id?: string | null
          respuesta?: Json
          solicitado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reembolsos_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reembolsos_proveedor_fkey"
            columns: ["proveedor"]
            isOneToOne: false
            referencedRelation: "proveedores_pago"
            referencedColumns: ["codigo"]
          },
        ]
      }
      resolvers: {
        Row: {
          as_header: boolean
          created_at: string
          cuit: string
          estado: string
          formato_web: string | null
          id: string
          id_pcp: string | null
          nombre: string
          nombre_reverso: string | null
          pcp_id: string | null
          soa: boolean
          token: string | null
          updated_at: string
          url: string
        }
        Insert: {
          as_header?: boolean
          created_at?: string
          cuit: string
          estado: string
          formato_web?: string | null
          id?: string
          id_pcp?: string | null
          nombre: string
          nombre_reverso?: string | null
          pcp_id?: string | null
          soa?: boolean
          token?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          as_header?: boolean
          created_at?: string
          cuit?: string
          estado?: string
          formato_web?: string | null
          id?: string
          id_pcp?: string | null
          nombre?: string
          nombre_reverso?: string | null
          pcp_id?: string | null
          soa?: boolean
          token?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      rpc_debug_log: {
        Row: {
          comercio_id: string | null
          created_at: string
          id: number
          legajo: string | null
          nota: string | null
          op: string
          payload: Json | null
          request_id: string | null
          row_id: string | null
          source_table: string
        }
        Insert: {
          comercio_id?: string | null
          created_at?: string
          id?: number
          legajo?: string | null
          nota?: string | null
          op: string
          payload?: Json | null
          request_id?: string | null
          row_id?: string | null
          source_table: string
        }
        Update: {
          comercio_id?: string | null
          created_at?: string
          id?: number
          legajo?: string | null
          nota?: string | null
          op?: string
          payload?: Json | null
          request_id?: string | null
          row_id?: string | null
          source_table?: string
        }
        Relationships: []
      }
      subaccount_balances: {
        Row: {
          saldo_conciliado: number
          saldo_disponible: number
          saldo_retenido: number
          subaccount_id: string
          updated_at: string
        }
        Insert: {
          saldo_conciliado?: number
          saldo_disponible?: number
          saldo_retenido?: number
          subaccount_id: string
          updated_at?: string
        }
        Update: {
          saldo_conciliado?: number
          saldo_disponible?: number
          saldo_retenido?: number
          subaccount_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subaccount_balances_subaccount_id_fkey"
            columns: ["subaccount_id"]
            isOneToOne: true
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
        ]
      }
      subaccounts: {
        Row: {
          apellido: string
          cbu: string | null
          cliente_legajo: string
          configuracion: Json
          created_at: string
          egresos: string | null
          email: string
          estado: string
          id: string
          ingresos: string | null
          limite: string | null
          moneda: string | null
          nombre: string
          responsable: string | null
          retiros_habilitados: boolean
          tipo: string
          updated_at: string
          validada: boolean
        }
        Insert: {
          apellido?: string
          cbu?: string | null
          cliente_legajo: string
          configuracion?: Json
          created_at?: string
          egresos?: string | null
          email?: string
          estado?: string
          id?: string
          ingresos?: string | null
          limite?: string | null
          moneda?: string | null
          nombre?: string
          responsable?: string | null
          retiros_habilitados?: boolean
          tipo?: string
          updated_at?: string
          validada?: boolean
        }
        Update: {
          apellido?: string
          cbu?: string | null
          cliente_legajo?: string
          configuracion?: Json
          created_at?: string
          egresos?: string | null
          email?: string
          estado?: string
          id?: string
          ingresos?: string | null
          limite?: string | null
          moneda?: string | null
          nombre?: string
          responsable?: string | null
          retiros_habilitados?: boolean
          tipo?: string
          updated_at?: string
          validada?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "subaccounts_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "subaccounts_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "subaccounts_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "subaccounts_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      sucursales: {
        Row: {
          calle: string | null
          ciudad: string | null
          codigo_postal: string | null
          comercio_id: string
          created_at: string
          eliminado_at: string | null
          email: string | null
          encargado: string | null
          estado: string
          estado_region: string | null
          horario: Json
          id: string
          id_externo: string | null
          nombre: string
          proveedor: string
          sincronizado_at: string | null
          telefono: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          calle?: string | null
          ciudad?: string | null
          codigo_postal?: string | null
          comercio_id: string
          created_at?: string
          eliminado_at?: string | null
          email?: string | null
          encargado?: string | null
          estado?: string
          estado_region?: string | null
          horario?: Json
          id?: string
          id_externo?: string | null
          nombre: string
          proveedor?: string
          sincronizado_at?: string | null
          telefono?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          calle?: string | null
          ciudad?: string | null
          codigo_postal?: string | null
          comercio_id?: string
          created_at?: string
          eliminado_at?: string | null
          email?: string | null
          encargado?: string | null
          estado?: string
          estado_region?: string | null
          horario?: Json
          id?: string
          id_externo?: string | null
          nombre?: string
          proveedor?: string
          sincronizado_at?: string | null
          telefono?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sucursales_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sucursales_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
          {
            foreignKeyName: "sucursales_proveedor_fkey"
            columns: ["proveedor"]
            isOneToOne: false
            referencedRelation: "proveedores_pago"
            referencedColumns: ["codigo"]
          },
        ]
      }
      tareas_programadas: {
        Row: {
          nombre: string
          resultado: Json
          ultima_corrida_at: string | null
        }
        Insert: {
          nombre: string
          resultado?: Json
          ultima_corrida_at?: string | null
        }
        Update: {
          nombre?: string
          resultado?: Json
          ultima_corrida_at?: string | null
        }
        Relationships: []
      }
      terminales: {
        Row: {
          comercio_id: string
          created_at: string
          es_punto_venta: boolean
          estado: string | null
          id: string
          id_externo: string
          modo: string | null
          proveedor: string
          serie: string | null
          sincronizado_at: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          comercio_id: string
          created_at?: string
          es_punto_venta?: boolean
          estado?: string | null
          id?: string
          id_externo: string
          modo?: string | null
          proveedor?: string
          serie?: string | null
          sincronizado_at?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          comercio_id?: string
          created_at?: string
          es_punto_venta?: boolean
          estado?: string | null
          id?: string
          id_externo?: string
          modo?: string | null
          proveedor?: string
          serie?: string | null
          sincronizado_at?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terminales_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terminales_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
          {
            foreignKeyName: "terminales_proveedor_fkey"
            columns: ["proveedor"]
            isOneToOne: false
            referencedRelation: "proveedores_pago"
            referencedColumns: ["codigo"]
          },
        ]
      }
      tipos_movimiento: {
        Row: {
          codigo: string
          created_at: string
          id: string
          nombre: string
          requiere_bandera: boolean
          requiere_comercio: boolean
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          requiere_bandera?: boolean
          requiere_comercio?: boolean
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
          requiere_bandera?: boolean
          requiere_comercio?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      transaction_status_history: {
        Row: {
          admin_user_id: string | null
          comentario: string | null
          estado_anterior_id: number | null
          estado_nuevo_id: number
          fecha: string
          id: string
          origen: string
          transaction_id: string
        }
        Insert: {
          admin_user_id?: string | null
          comentario?: string | null
          estado_anterior_id?: number | null
          estado_nuevo_id: number
          fecha?: string
          id?: string
          origen: string
          transaction_id: string
        }
        Update: {
          admin_user_id?: string | null
          comentario?: string | null
          estado_anterior_id?: number | null
          estado_nuevo_id?: number
          fecha?: string
          id?: string
          origen?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_status_history_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_status_history_estado_anterior_id_fkey"
            columns: ["estado_anterior_id"]
            isOneToOne: false
            referencedRelation: "estados_movimiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_status_history_estado_nuevo_id_fkey"
            columns: ["estado_nuevo_id"]
            isOneToOne: false
            referencedRelation: "estados_movimiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_status_history_movimiento_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          bandera: string | null
          bandera_id: string | null
          cliente_id: string
          comercio_id: string | null
          comision: number
          created_at: string
          currency_code: string
          cvu: string | null
          destinatario_banco: string | null
          destinatario_cuit: string | null
          destinatario_nombre: string | null
          estado_id: number
          fecha: string
          held_block_id: string | null
          id: string
          id_txn: string
          impuesto: number
          ledger_status: string
          legajo: string
          monto_cobrado: number
          monto_operacion: number
          subcuenta_id: string | null
          tipo: string
        }
        Insert: {
          bandera?: string | null
          bandera_id?: string | null
          cliente_id: string
          comercio_id?: string | null
          comision: number
          created_at?: string
          currency_code?: string
          cvu?: string | null
          destinatario_banco?: string | null
          destinatario_cuit?: string | null
          destinatario_nombre?: string | null
          estado_id: number
          fecha?: string
          held_block_id?: string | null
          id?: string
          id_txn: string
          impuesto: number
          ledger_status?: string
          legajo: string
          monto_cobrado: number
          monto_operacion: number
          subcuenta_id?: string | null
          tipo: string
        }
        Update: {
          bandera?: string | null
          bandera_id?: string | null
          cliente_id?: string
          comercio_id?: string | null
          comision?: number
          created_at?: string
          currency_code?: string
          cvu?: string | null
          destinatario_banco?: string | null
          destinatario_cuit?: string | null
          destinatario_nombre?: string | null
          estado_id?: number
          fecha?: string
          held_block_id?: string | null
          id?: string
          id_txn?: string
          impuesto?: number
          ledger_status?: string
          legajo?: string
          monto_cobrado?: number
          monto_operacion?: number
          subcuenta_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bandera_id_fkey"
            columns: ["bandera_id"]
            isOneToOne: false
            referencedRelation: "banderas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
          {
            foreignKeyName: "transactions_estado_id_fkey"
            columns: ["estado_id"]
            isOneToOne: false
            referencedRelation: "estados_movimiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_held_block_id_fkey"
            columns: ["held_block_id"]
            isOneToOne: false
            referencedRelation: "account_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_held_block_id_fkey"
            columns: ["held_block_id"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transactions_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transactions_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transactions_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transactions_subcuenta_id_fkey"
            columns: ["subcuenta_id"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias_borrador: {
        Row: {
          cliente_legajo: string
          concepto: string | null
          created_at: string
          destinatario_alias: string | null
          destinatario_banco: string | null
          destinatario_cbu: string | null
          destinatario_cuit: string | null
          destinatario_identifier: string
          destinatario_kind: string
          destinatario_nombre: string | null
          id: string
          monto: number
          subcuenta_origen: string | null
        }
        Insert: {
          cliente_legajo: string
          concepto?: string | null
          created_at?: string
          destinatario_alias?: string | null
          destinatario_banco?: string | null
          destinatario_cbu?: string | null
          destinatario_cuit?: string | null
          destinatario_identifier: string
          destinatario_kind: string
          destinatario_nombre?: string | null
          id?: string
          monto: number
          subcuenta_origen?: string | null
        }
        Update: {
          cliente_legajo?: string
          concepto?: string | null
          created_at?: string
          destinatario_alias?: string | null
          destinatario_banco?: string | null
          destinatario_cbu?: string | null
          destinatario_cuit?: string | null
          destinatario_identifier?: string
          destinatario_kind?: string
          destinatario_nombre?: string | null
          id?: string
          monto?: number
          subcuenta_origen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_borrador_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transferencias_borrador_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transferencias_borrador_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transferencias_borrador_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transferencias_borrador_subcuenta_origen_fkey"
            columns: ["subcuenta_origen"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias_programadas: {
        Row: {
          actualizado_at: string | null
          cliente_legajo: string
          concepto: string | null
          created_at: string
          destinatario_alias: string | null
          destinatario_banco: string | null
          destinatario_cbu: string | null
          destinatario_cuit: string | null
          destinatario_identifier: string
          destinatario_kind: string
          destinatario_nombre: string | null
          estado: string
          fecha_envio: string
          hora_envio: string
          id: string
          monto: number
          subcuenta_origen: string | null
        }
        Insert: {
          actualizado_at?: string | null
          cliente_legajo: string
          concepto?: string | null
          created_at?: string
          destinatario_alias?: string | null
          destinatario_banco?: string | null
          destinatario_cbu?: string | null
          destinatario_cuit?: string | null
          destinatario_identifier: string
          destinatario_kind: string
          destinatario_nombre?: string | null
          estado?: string
          fecha_envio: string
          hora_envio: string
          id?: string
          monto: number
          subcuenta_origen?: string | null
        }
        Update: {
          actualizado_at?: string | null
          cliente_legajo?: string
          concepto?: string | null
          created_at?: string
          destinatario_alias?: string | null
          destinatario_banco?: string | null
          destinatario_cbu?: string | null
          destinatario_cuit?: string | null
          destinatario_identifier?: string
          destinatario_kind?: string
          destinatario_nombre?: string | null
          estado?: string
          fecha_envio?: string
          hora_envio?: string
          id?: string
          monto?: number
          subcuenta_origen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_programadas_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transferencias_programadas_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transferencias_programadas_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transferencias_programadas_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transferencias_programadas_subcuenta_origen_fkey"
            columns: ["subcuenta_origen"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
        ]
      }
      validaciones: {
        Row: {
          cliente_legajo: string
          created_at: string
          estado: string
          fecha: string
          id: string
          proveedor: string
        }
        Insert: {
          cliente_legajo: string
          created_at?: string
          estado: string
          fecha?: string
          id?: string
          proveedor: string
        }
        Update: {
          cliente_legajo?: string
          created_at?: string
          estado?: string
          fecha?: string
          id?: string
          proveedor?: string
        }
        Relationships: [
          {
            foreignKeyName: "validaciones_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "validaciones_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "validaciones_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "validaciones_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      verificaciones_correo: {
        Row: {
          correo: string
          created_at: string
          expires_at: string
          token: string
          usado: boolean
          user_id: string
        }
        Insert: {
          correo: string
          created_at?: string
          expires_at: string
          token: string
          usado?: boolean
          user_id: string
        }
        Update: {
          correo?: string
          created_at?: string
          expires_at?: string
          token?: string
          usado?: boolean
          user_id?: string
        }
        Relationships: []
      }
      webhook_eventos: {
        Row: {
          error: string | null
          estado_externo: string | null
          evento: string | null
          firma_valida: boolean | null
          id: string
          id_externo: string | null
          instancia_id: string | null
          intentos: number
          origen: string
          pago_id: string | null
          payload: Json
          procesado_at: string | null
          proveedor: string
          recibido_at: string
          resultado: string | null
          webhook_id: string | null
        }
        Insert: {
          error?: string | null
          estado_externo?: string | null
          evento?: string | null
          firma_valida?: boolean | null
          id?: string
          id_externo?: string | null
          instancia_id?: string | null
          intentos?: number
          origen: string
          pago_id?: string | null
          payload?: Json
          procesado_at?: string | null
          proveedor: string
          recibido_at?: string
          resultado?: string | null
          webhook_id?: string | null
        }
        Update: {
          error?: string | null
          estado_externo?: string | null
          evento?: string | null
          firma_valida?: boolean | null
          id?: string
          id_externo?: string | null
          instancia_id?: string | null
          intentos?: number
          origen?: string
          pago_id?: string | null
          payload?: Json
          procesado_at?: string | null
          proveedor?: string
          recibido_at?: string
          resultado?: string | null
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_eventos_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_eventos_proveedor_fkey"
            columns: ["proveedor"]
            isOneToOne: false
            referencedRelation: "proveedores_pago"
            referencedColumns: ["codigo"]
          },
        ]
      }
    }
    Views: {
      auditoria_legajos: {
        Row: {
          fecha: string | null
          id_txn: string | null
          legajo: string | null
          observacion: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transactions_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transactions_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transactions_legajo_fkey"
            columns: ["legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
        ]
      }
      v_account_blocks: {
        Row: {
          accepted_at: string | null
          accepted_by_name: string | null
          alert_id: string | null
          block_status: string | null
          blocked_at: string | null
          blocked_by_name: string | null
          client_id: string | null
          compliance_status: string | null
          correo: string | null
          held_amount: number | null
          id: string | null
          id_txn: string | null
          legajo: string | null
          nombre: string | null
          origin: string | null
          reason: string | null
          release_notes: string | null
          released_at: string | null
          released_by_name: string | null
          rule_id: string | null
          rule_name: string | null
          scope: string | null
          subaccount_id: string | null
          subcuenta_cvu: string | null
          subcuenta_nombre: string | null
          transaction_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_blocks_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_blocks_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_blocks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_blocks_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_blocks_subaccount_id_fkey"
            columns: ["subaccount_id"]
            isOneToOne: false
            referencedRelation: "subaccounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_blocks_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      v_alerts: {
        Row: {
          accepted_at: string | null
          accepted_by_name: string | null
          client_id: string | null
          correo: string | null
          created_at: string | null
          description: string | null
          details: Json | null
          due_at: string | null
          fecha_operacion: string | null
          id: string | null
          id_txn: string | null
          is_active: boolean | null
          legajo: string | null
          monto_operacion: number | null
          nombre: string | null
          plaft_match_id: number | null
          resolution: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by_name: string | null
          rule_code: string | null
          rule_id: string | null
          status: string | null
          tipo_operacion: string | null
          transaction_id: string | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_plaft_match_id_fkey"
            columns: ["plaft_match_id"]
            isOneToOne: false
            referencedRelation: "plaft_coincidencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "alert_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      v_client_block_parameters: {
        Row: {
          client_id: string | null
          company_min_wages: number | null
          correo: string | null
          created_at: string | null
          id: string | null
          individual_min_wages: number | null
          legajo: string | null
          nombre: string | null
          tipo_persona: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_block_parameters_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_cliente_riesgo_vigente: {
        Row: {
          cliente_legajo: string | null
          detalle: Json | null
          evaluado_por: string | null
          motivo: string | null
          nivel: string | null
          vigente_desde: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_perfil_riesgo_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_perfil_riesgo_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_perfil_riesgo_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_perfil_riesgo_cliente_legajo_fkey"
            columns: ["cliente_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "cliente_perfil_riesgo_evaluado_por_fkey"
            columns: ["evaluado_por"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      v_lotes_venta: {
        Row: {
          bandera: string | null
          cantidad_operaciones: number | null
          comercio_id: string | null
          comercios_id: string | null
          comercios_legajo: string | null
          comercios_nombre_comercio: string | null
          comercios_usuario: string | null
          comision: number | null
          fecha: string | null
          importe_bruto: number | null
          importe_neto: number | null
          impuestos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comercios_legajo_fkey"
            columns: ["comercios_legajo"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "comercios_legajo_fkey"
            columns: ["comercios_legajo"]
            isOneToOne: false
            referencedRelation: "v_account_blocks"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "comercios_legajo_fkey"
            columns: ["comercios_legajo"]
            isOneToOne: false
            referencedRelation: "v_alerts"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "comercios_legajo_fkey"
            columns: ["comercios_legajo"]
            isOneToOne: false
            referencedRelation: "v_client_block_parameters"
            referencedColumns: ["legajo"]
          },
          {
            foreignKeyName: "transactions_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "comercios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_comercio_id_fkey"
            columns: ["comercio_id"]
            isOneToOne: false
            referencedRelation: "v_lotes_venta"
            referencedColumns: ["comercios_id"]
          },
        ]
      }
      v_security_summary: {
        Row: {
          tablas_con_rls: number | null
          tablas_con_rls_fuerte: number | null
          total_policies: number | null
        }
        Relationships: []
      }
      v_transaction_lines: {
        Row: {
          comercio_id: string | null
          concepto: string | null
          cuit: string | null
          cvu: string | null
          cvu_propio: string | null
          email: string | null
          estado_codigo: string | null
          estado_id: number | null
          estado_nombre: string | null
          fecha: string | null
          id_txn: string | null
          ledger_status: string | null
          legajo: string | null
          line_id: string | null
          line_no: number | null
          monto: number | null
          nombre: string | null
          nombre_destino: string | null
          posting_key: string | null
          reversal_of_entry_id: string | null
          subaccount_id: string | null
          tipo_linea: string | null
          tipo_operacion: string | null
          transaction_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _alerta_desde_plaft: { Args: { p_match_id: number }; Returns: string }
      _bloqueo_activo: {
        Args: { p_client_id: string; p_subaccount_id?: string }
        Returns: string
      }
      _cobre_cuenta: {
        Args: { p_moneda: string; p_tipo: string }
        Returns: string
      }
      _comision_aplicable: {
        Args: { p_cliente_id: string; p_subcuenta_id: string; p_tipo: string }
        Returns: {
          id: string
          modalidad: string
          monto_fijo: number
          por_cvu: boolean
          porcentaje: number
          porcentaje_impuesto: number
        }[]
      }
      _ensure_subaccount: {
        Args: { p_legajo: string; p_tipo: string }
        Returns: string
      }
      _es_transferencia_interna: {
        Args: { p_cliente_id: string; p_destino: string }
        Returns: boolean
      }
      _estado_movimiento_id: { Args: { p_codigo: string }; Returns: number }
      _evaluar_retiros_fallidos: {
        Args: { p_transaction_id: string }
        Returns: undefined
      }
      _ledger_account_id: { Args: { p_code: string }; Returns: string }
      _ledger_line: {
        Args: {
          p_account_id: string
          p_amount: number
          p_concepto?: string
          p_entry_type: string
        }
        Returns: Json
      }
      _ledger_lines: { Args: { p_lines: Json[] }; Returns: Json }
      _ledger_reverse: {
        Args: {
          p_ledger_status?: string
          p_posting_key: string
          p_transaction_id: string
        }
        Returns: number
      }
      _ledger_sub_account_id: {
        Args: { p_bucket: string; p_subaccount_id: string }
        Returns: string
      }
      _llamada_confiable: { Args: never; Returns: boolean }
      _lock_cliente_reglas: {
        Args: { p_client_id: string }
        Returns: undefined
      }
      _puede: {
        Args: { p_accion: string; p_recurso: string }
        Returns: boolean
      }
      _rechazar_retiro: {
        Args: { p_codigo: string; p_transaction_id: string }
        Returns: Json
      }
      _registrar_alerta: {
        Args: {
          p_client_id: string
          p_dedupe_key: string
          p_description: string
          p_details: Json
          p_plaft_match_id?: number
          p_rule_id: string
          p_transaction_id: string
          p_type: string
        }
        Returns: string
      }
      _registrar_bloqueo_regla: {
        Args: {
          p_alert_id: string
          p_client_id: string
          p_reason: string
          p_rule_id: string
          p_transaction_id: string
        }
        Returns: string
      }
      _subaccount_add_conciliado: {
        Args: { p_delta: number; p_subaccount_id: string }
        Returns: undefined
      }
      _tx_confirmar_transferencia: {
        Args: { p_estado_bdc?: string; p_tx_id: string }
        Returns: Json
      }
      _tx_operacion_interna: {
        Args: {
          p_comercio_id?: string
          p_id_txn: string
          p_legajo: string
          p_monto: number
          p_subcuenta_id?: string
          p_tipo: string
        }
        Returns: string
      }
      _tx_reservar_transferencia: {
        Args: {
          p_cliente_id: string
          p_destinatario_banco?: string
          p_destinatario_cbu: string
          p_destinatario_cuit?: string
          p_destinatario_nombre?: string
          p_legajo: string
          p_monto: number
          p_origin_id: string
          p_subcuenta_origen: string
        }
        Returns: Json
      }
      aceptar_alerta: { Args: { p_id: string }; Returns: undefined }
      aceptar_bloqueo: { Args: { p_id: string }; Returns: undefined }
      acreditar_lote: {
        Args: {
          p_adelantos_monto?: number
          p_lote_id: string
          p_notas?: string
        }
        Returns: Json
      }
      actualizar_estado_lote: {
        Args: { p_estado: string; p_lote_id: string }
        Returns: undefined
      }
      actualizar_link_registro: {
        Args: { p_link: string; p_registro_id: string }
        Returns: undefined
      }
      agregar_registros_lote: {
        Args: { p_lote_id: string; p_registros: Json }
        Returns: number
      }
      ajustar_saldo_subcuenta: {
        Args: {
          p_bucket?: string
          p_monto: number
          p_motivo: string
          p_subaccount_id: string
        }
        Returns: Json
      }
      alertas_proveedor_pagos: { Args: { p_proveedor?: string }; Returns: Json }
      aplicar_contracargo_retenido: {
        Args: { p_contracargo_id: string; p_lote_id: string }
        Returns: Json
      }
      aplicar_estado_pago: {
        Args: {
          p_estado: string
          p_estado_proveedor?: string
          p_metodo?: string
          p_motivo?: string
          p_pago_id: string
          p_proveedor_pago_id?: string
          p_respuesta?: Json
        }
        Returns: {
          caja_id: string | null
          cliente_legajo: string | null
          comercio_id: string | null
          comision_proveedor: number | null
          conciliado_at: string | null
          conexion_id: string | null
          created_at: string
          entorno: string
          estado: string
          estado_proveedor: string | null
          id: string
          idempotency_key: string
          link_id: string | null
          link_pago_id: string | null
          metodo: string | null
          moneda: string
          monto: number
          monto_reembolsado: number
          motivo: string | null
          neto_proveedor: number | null
          pagado_at: string | null
          pagador_email: string | null
          pagador_nombre: string | null
          pay_link: string | null
          proveedor: string
          proveedor_orden_id: string | null
          proveedor_pago_id: string | null
          proveedor_transaccion_id: string | null
          referencia: string | null
          referencia_url: string | null
          referencia_vence_at: string | null
          respuesta: Json
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pagos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      aplicar_liquidacion_lote: {
        Args: {
          p_fecha_cobro_real?: string
          p_liquidacion: Json
          p_lote_id: string
        }
        Returns: Json
      }
      buscar_asignacion_impuesto: {
        Args: { p_codigo_impuesto: string; p_legajo: string }
        Returns: {
          asignacion_id: string
          estado: string
          monto: number
          tipo: string
        }[]
      }
      calcular_comision: {
        Args: {
          p_cliente_id: string
          p_destino?: string
          p_monto: number
          p_subcuenta_id?: string
          p_tipo?: string
        }
        Returns: {
          comision: number
          impuesto: number
        }[]
      }
      calcular_comision_transferencia: {
        Args: {
          p_cliente_id: string
          p_destino?: string
          p_monto: number
          p_subcuenta_origen?: string
        }
        Returns: {
          comision: number
          impuesto: number
        }[]
      }
      calcular_fecha_limite_mediacion: {
        Args: { p_desde?: string; p_dias_hab?: number }
        Returns: string
      }
      calcular_retenciones_lote: { Args: { p_lote_id: string }; Returns: Json }
      calcular_total_impuestos_lote: {
        Args: { p_lote_id: string }
        Returns: number
      }
      calendario_acreditaciones_v2: {
        Args: {
          p_anio: number
          p_bandera?: string
          p_comercio_id?: string
          p_estado?: string
          p_mes: number
        }
        Returns: Json
      }
      calendario_adelantos_por_dia: {
        Args: { p_comercio_id: string; p_fecha?: string }
        Returns: Json
      }
      calendario_exportar_dia: {
        Args: { p_comercio_id?: string; p_fecha: string }
        Returns: Json
      }
      calendario_resumen_saldos: {
        Args: { p_comercio_id?: string }
        Returns: Json
      }
      cambiar_estado_movimiento: {
        Args: {
          p_comentario?: string
          p_movimiento_id: string
          p_nuevo_estado_id: number
        }
        Returns: Json
      }
      cancelar_adelanto: {
        Args: { p_adelanto_id: string }
        Returns: {
          comercio_id: string
          created_at: string
          estado: string
          fecha_acreditacion: string | null
          fecha_resolucion: string | null
          fecha_solicitud: string
          id: string
          lote_acreditacion_id: string | null
          monto_por_acreditar: number | null
          monto_solicitado: number
          motivo: string | null
          plazo_adelantado_dias: number
          plazo_original_dias: number
          resuelto_por: string | null
          tasa_interes_pct: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "adelantos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancelar_transferencia_bdc: {
        Args: { p_motivo?: string; p_origin_id: string }
        Returns: Json
      }
      cliente_legajo_actual: { Args: never; Returns: string }
      cliente_tiene_comision: {
        Args: { p_cliente_id: string }
        Returns: boolean
      }
      cliente_tiene_movimientos: {
        Args: { p_legajo: string }
        Returns: boolean
      }
      cobre_comision_cruce: {
        Args: { p_legajo: string; p_monto: number; p_subcuenta_id: string }
        Returns: Json
      }
      cobre_confirmar_cruce: { Args: { p_cruce_id: string }; Returns: Json }
      cobre_confirmar_transferencia: {
        Args: { p_id_txn: string }
        Returns: Json
      }
      cobre_instancia_guardar_secretos: {
        Args: {
          p_clave_webhook: string
          p_instancia_id: string
          p_secret: string
        }
        Returns: undefined
      }
      cobre_instancia_leer: { Args: { p_instancia_id: string }; Returns: Json }
      cobre_liberar_cruce: { Args: { p_cruce_id: string }; Returns: Json }
      cobre_registrar_deposito: {
        Args: {
          p_cep?: string
          p_clabe: string
          p_clave_rastreo?: string
          p_cuenta_externa_id: string
          p_fecha?: string
          p_modo: string
          p_monto: number
          p_origen?: string
          p_remitente?: string
          p_remitente_cuenta?: string
          p_remitente_id?: string
          p_subcuenta_id?: string
          p_transaccion_id: string
        }
        Returns: Json
      }
      cobre_reintegrar_transferencia: {
        Args: { p_id_txn: string; p_motivo: string }
        Returns: Json
      }
      cobre_reservar_cruce: { Args: { p_cruce_id: string }; Returns: Json }
      cobre_reservar_transferencia: {
        Args: {
          p_destinatario_banco: string
          p_destinatario_nombre: string
          p_destino: string
          p_id_txn: string
          p_legajo: string
          p_monto: number
          p_subcuenta_id: string
        }
        Returns: Json
      }
      cobre_saldo_esperado_comercio: {
        Args: { p_legajo: string }
        Returns: number
      }
      confirmar_adelanto: {
        Args: { p_adelanto_id: string }
        Returns: {
          estado: string
          fecha_resolucion: string
          id: string
          resuelto_por: string
        }[]
      }
      confirmar_transferencia_bdc: {
        Args: { p_estado_bdc?: string; p_origin_id: string }
        Returns: Json
      }
      contracargos_doc_comercio_id: {
        Args: { p_name: string }
        Returns: string
      }
      cotizar_transferencia: {
        Args: {
          p_destino?: string
          p_monto: number
          p_subcuenta_origen: string
        }
        Returns: Json
      }
      crear_bloqueo_manual: {
        Args: { p_legajo: string; p_reason: string; p_subaccount_id: string }
        Returns: string
      }
      crear_lote: {
        Args: {
          p_cliente_legajo: string
          p_dia_pago: number
          p_fecha_venc_1: string
          p_fecha_venc_2: string
          p_fecha_venc_3: string
          p_id: string
          p_medios_pago: Json
          p_nombre: string
          p_notificaciones: boolean
          p_pagos_parciales: boolean
          p_periodo: string
          p_tasa_interes: number
        }
        Returns: undefined
      }
      current_admin_id: { Args: never; Returns: string }
      current_cliente_id: { Args: never; Returns: string }
      current_cliente_legajo: { Args: never; Returns: string }
      ejecutar_barrido_compliance: { Args: never; Returns: Json }
      eliminar_auth_por_email: { Args: { p_email: string }; Returns: undefined }
      eliminar_lote: { Args: { p_lote_id: string }; Returns: undefined }
      eliminar_parametros_bloqueo_cliente: {
        Args: { p_id: string }
        Returns: undefined
      }
      es_backoffice: { Args: never; Returns: boolean }
      es_dia_habil: { Args: { p_fecha: string }; Returns: boolean }
      evaluar_reglas_operacion: {
        Args: { p_operacion: string; p_transaction_id: string }
        Returns: Json
      }
      exigir_acceso_comercio: {
        Args: { p_comercio_id: string }
        Returns: undefined
      }
      exigir_acceso_legajo: { Args: { p_legajo: string }; Returns: undefined }
      exigir_acceso_lote: { Args: { p_lote_id: string }; Returns: undefined }
      exigir_backoffice: { Args: never; Returns: undefined }
      exigir_permiso: {
        Args: { p_accion: string; p_recurso: string }
        Returns: undefined
      }
      finalizar_reembolso: {
        Args: {
          p_error?: string
          p_ok: boolean
          p_proveedor_reembolso_id?: string
          p_reembolso_id: string
          p_respuesta?: Json
        }
        Returns: {
          created_at: string
          error: string | null
          estado: string
          finalizado_at: string | null
          id: string
          monto: number
          motivo: string
          nota: string | null
          origen: string
          pago_id: string
          proveedor: string
          proveedor_reembolso_id: string | null
          respuesta: Json
          solicitado_por: string | null
        }
        SetofOptions: {
          from: "*"
          to: "reembolsos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_acreditar_adelanto: {
        Args: { p_adelanto_id: string; p_notas?: string }
        Returns: Json
      }
      fn_aprobar_adelanto: {
        Args: { p_adelanto_id: string; p_notas?: string; p_tasa_pct: number }
        Returns: Json
      }
      fn_calcular_tope_disponible: {
        Args: { p_comercio_id: string }
        Returns: number
      }
      fn_rpc_log_event: {
        Args: {
          p_context?: Json
          p_message: string
          p_ok: boolean
          p_source: string
          p_step: string
        }
        Returns: undefined
      }
      generar_legajo: {
        Args: { p_cuit: string; p_tipo_persona: string }
        Returns: string
      }
      guardar_alert_rules: { Args: { p_rules: Json }; Returns: number }
      guardar_parametros_bloqueo_cliente: {
        Args: {
          p_company_min_wages: number
          p_id?: string
          p_individual_min_wages: number
          p_legajo: string
        }
        Returns: string
      }
      guardar_smvm: { Args: { p_monto: number }; Returns: undefined }
      incrementar_vistas_link: {
        Args: { p_link_id: string }
        Returns: undefined
      }
      incrementar_vistas_lote: {
        Args: { p_lote_id: string }
        Returns: undefined
      }
      ingresar_adelanto: {
        Args: {
          fecha_acreditacion?: string
          lote_acreditacion_id?: string
          monto: number
          motivo?: string
        }
        Returns: {
          comercio_id: string
          created_at: string
          estado: string
          fecha_acreditacion: string | null
          fecha_resolucion: string | null
          fecha_solicitud: string
          id: string
          lote_acreditacion_id: string | null
          monto_por_acreditar: number | null
          monto_solicitado: number
          motivo: string | null
          plazo_adelantado_dias: number
          plazo_original_dias: number
          resuelto_por: string | null
          tasa_interes_pct: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "adelantos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin: { Args: never; Returns: boolean }
      ledger_conciliar_saldos: {
        Args: never
        Returns: {
          bucket: string
          diferencia: number
          saldo_ledger: number
          saldo_operativo: number
          subaccount_id: string
        }[]
      }
      ledger_post: {
        Args: {
          p_ledger_status?: string
          p_lines: Json
          p_memo?: string
          p_posting_key: string
          p_transaction_id: string
        }
        Returns: boolean
      }
      leer_parametro_numerico: {
        Args: { p_clave: string; p_default: number }
        Returns: number
      }
      leer_smvm: { Args: never; Returns: number }
      legajo_de_sesion: { Args: never; Returns: string }
      liberar_bloqueo: {
        Args: { p_id: string; p_notes: string }
        Returns: Json
      }
      obtener_link_pago: { Args: { p_codigo: string }; Returns: Json }
      pais_predeterminado: { Args: never; Returns: string }
      proveedor_borrar_secreto: {
        Args: { p_conexion_id: string }
        Returns: undefined
      }
      proveedor_guardar_secreto: {
        Args: { p_conexion_id: string; p_secreto: string }
        Returns: string
      }
      proveedor_leer_secreto: {
        Args: { p_conexion_id: string }
        Returns: string
      }
      registrar_deposito_entrante: {
        Args: {
          p_cbu_destino: string
          p_cbu_origen?: string
          p_cuit_origen?: string
          p_fecha?: string
          p_id_coelsa: string
          p_importe: number
          p_titular_origen?: string
        }
        Returns: Json
      }
      registrar_pago_link: {
        Args: {
          p_cliente_legajo: string
          p_link_id: string
          p_metodo: string
          p_monto: number
          p_pagador_email: string
          p_pagador_nombre: string
          p_referencia?: string
        }
        Returns: Json
      }
      registrar_pago_link_completo: {
        Args: {
          p_bandera_id: string
          p_cliente_legajo: string
          p_comercio_id: string
          p_link_id: string
          p_monto: number
          p_pagador_email: string
          p_pagador_nombre: string
          p_referencia?: string
        }
        Returns: Json
      }
      registrar_pago_payway: {
        Args: {
          p_bandera_id: string
          p_cliente_id: string
          p_costo_payway_pago_unico?: number
          p_cuotas?: number
          p_link_id: string
          p_monto: number
          p_pagador_email: string
          p_pagador_nombre: string
          p_payway_payment_id: string
          p_payway_status: string
          p_payway_status_detail?: string
          p_site_transaction_id: string
        }
        Returns: Json
      }
      registrar_transferencia_bdc: {
        Args: {
          p_concepto?: string
          p_destinatario_cbu: string
          p_estado_bdc?: string
          p_monto: number
          p_origin_id: string
          p_subcuenta_origen: string
        }
        Returns: Json
      }
      registrar_transferencia_bdc_detallada: {
        Args: {
          p_concepto?: string
          p_destinatario_banco?: string
          p_destinatario_cbu: string
          p_destinatario_cuit?: string
          p_destinatario_nombre?: string
          p_estado_bdc?: string
          p_monto: number
          p_origin_id: string
          p_subcuenta_origen: string
        }
        Returns: Json
      }
      registrar_transferencia_externa: {
        Args: {
          p_concepto?: string
          p_destinatario_cbu: string
          p_monto: number
          p_subcuenta_origen: string
        }
        Returns: Json
      }
      registrar_transferencia_subcuentas: {
        Args: {
          p_concepto?: string
          p_monto: number
          p_subcuenta_destino: string
          p_subcuenta_origen: string
        }
        Returns: Json
      }
      reporte_cobros_proveedor: {
        Args: {
          p_comercio_id?: string
          p_desde: string
          p_hasta: string
          p_proveedor?: string
        }
        Returns: Json
      }
      reservar_reembolso: {
        Args: {
          p_monto: number
          p_motivo: string
          p_nota: string
          p_origen: string
          p_pago_id: string
          p_usuario: string
        }
        Returns: string
      }
      reservar_tarea: {
        Args: { p_intervalo: string; p_nombre: string }
        Returns: boolean
      }
      reservar_transferencia_bdc: {
        Args: {
          p_concepto?: string
          p_destinatario_banco?: string
          p_destinatario_cbu: string
          p_destinatario_cuit?: string
          p_destinatario_nombre?: string
          p_monto: number
          p_origin_id: string
          p_subcuenta_origen: string
        }
        Returns: Json
      }
      reservar_transferencia_servicio: {
        Args: {
          p_destinatario_banco?: string
          p_destinatario_cbu: string
          p_destinatario_cuit?: string
          p_destinatario_nombre?: string
          p_monto: number
          p_origin_id: string
          p_subcuenta_origen: string
        }
        Returns: Json
      }
      resolver_alerta: {
        Args: { p_id: string; p_notes: string; p_resolution: string }
        Returns: undefined
      }
      resumen_lotes_admin: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: Json
      }
      rls_es_admin: { Args: never; Returns: boolean }
      rls_es_cliente_de: { Args: { p_legajo: string }; Returns: boolean }
      rls_es_propietario_de_cliente: {
        Args: { p_cliente_id: string }
        Returns: boolean
      }
      rls_tiene_permiso: {
        Args: { p_accion: string; p_recurso_codigo: string }
        Returns: boolean
      }
      rpc_debug_log_por_comercio: {
        Args: { p_comercio_id: string; p_n?: number }
        Returns: {
          comercio_id: string | null
          created_at: string
          id: number
          legajo: string | null
          nota: string | null
          op: string
          payload: Json | null
          request_id: string | null
          row_id: string | null
          source_table: string
        }[]
        SetofOptions: {
          from: "*"
          to: "rpc_debug_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_debug_log_por_pago: {
        Args: { p_n?: number; p_site_transaction_id: string }
        Returns: {
          comercio_id: string | null
          created_at: string
          id: number
          legajo: string | null
          nota: string | null
          op: string
          payload: Json | null
          request_id: string | null
          row_id: string | null
          source_table: string
        }[]
        SetofOptions: {
          from: "*"
          to: "rpc_debug_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_debug_log_recientes: {
        Args: { p_n?: number }
        Returns: {
          comercio_id: string | null
          created_at: string
          id: number
          legajo: string | null
          nota: string | null
          op: string
          payload: Json | null
          request_id: string | null
          row_id: string | null
          source_table: string
        }[]
        SetofOptions: {
          from: "*"
          to: "rpc_debug_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_debug_log_resumen: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: {
          cantidad: number
          op: string
          primer_evento: string
          source_table: string
          ultimo_evento: string
        }[]
      }
      rpc_debug_log_truncar: { Args: never; Returns: number }
      rpc_pool_recaudacion: { Args: never; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      simular_deposito_entrante: {
        Args: {
          p_cbu_destino: string
          p_cbu_origen?: string
          p_cuit_origen?: string
          p_importe: number
          p_titular_origen?: string
        }
        Returns: Json
      }
      sumar_dias_habiles:
        | { Args: { p_dias: number; p_fecha: string }; Returns: string }
        | {
            Args: { p_dias: number; p_fecha: string; p_pais: string }
            Returns: string
          }
      usuario_comercio_id: { Args: never; Returns: string }
      validar_operacion_comercio: {
        Args: { p_comercio_id: string }
        Returns: boolean
      }
      validar_parametros_alert_rule: {
        Args: { p_code: string; p_params: Json }
        Returns: undefined
      }
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
