// Package emitter generates runtime artifacts, TypeScript SDK, and PostgreSQL schema.
package emitter

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/forge-lang/forge/compiler/internal/analyzer"
	"github.com/forge-lang/forge/compiler/internal/diag"
	"github.com/forge-lang/forge/compiler/internal/normalizer"
	"github.com/forge-lang/forge/compiler/internal/planner"
)

// Artifact is the compiled runtime artifact.
type Artifact struct {
	Version     string                      `json:"version"`
	AppName     string                      `json:"app_name"`
	Auth        string                      `json:"auth"`
	Database    string                      `json:"database"`
	Entities    map[string]*EntitySchema    `json:"entities"`
	Actions     map[string]*ActionSchema    `json:"actions"`
	Rules       []*RuleSchema               `json:"rules"`
	Access      map[string]*AccessSchema    `json:"access"`
	Views       map[string]*ViewSchema      `json:"views"`
	Jobs        map[string]*JobSchema       `json:"jobs"`
	Hooks       []*HookSchema               `json:"hooks"`
	Webhooks    map[string]*WebhookSchema   `json:"webhooks"`
	Messages    map[string]*MessageSchema   `json:"messages"`
	Migration   *MigrationSchema            `json:"migration"`
}

// EntitySchema represents an entity in the artifact.
type EntitySchema struct {
	Name      string                   `json:"name"`
	Table     string                   `json:"table"`
	Fields    map[string]*FieldSchema  `json:"fields"`
	Relations map[string]*RelSchema    `json:"relations"`
}

// FieldSchema represents a field in the artifact.
type FieldSchema struct {
	Name       string      `json:"name"`
	Type       string      `json:"type"`
	SQLType    string      `json:"sql_type"`
	Nullable   bool        `json:"nullable"`
	Unique     bool        `json:"unique"`
	Default    interface{} `json:"default,omitempty"`
	EnumValues []string    `json:"enum_values,omitempty"`
	MaxLength  int         `json:"max_length,omitempty"`
}

// RelSchema represents a relation in the artifact.
type RelSchema struct {
	Name       string `json:"name"`
	Target     string `json:"target"`
	TargetTable string `json:"target_table"`
	ForeignKey string `json:"foreign_key"`
	IsMany     bool   `json:"is_many"`
	OnDelete   string `json:"on_delete"`
}

// ActionSchema represents an action in the artifact.
type ActionSchema struct {
	Name        string   `json:"name"`
	InputEntity string   `json:"input_entity"`
	Rules       []string `json:"rules"`
	Hooks       []string `json:"hooks"`
}

// RuleSchema represents a rule in the artifact.
type RuleSchema struct {
	ID           string `json:"id"`
	Entity       string `json:"entity"`
	Operation    string `json:"operation"`
	Condition    string `json:"condition"`
	SQLPredicate string `json:"sql_predicate"`
	EmitCode     string `json:"emit_code,omitempty"`
	IsForbid     bool   `json:"is_forbid"`
}

// AccessSchema represents access control in the artifact.
type AccessSchema struct {
	Entity    string `json:"entity"`
	Table     string `json:"table"`
	ReadSQL   string `json:"read_sql"`
	WriteSQL  string `json:"write_sql"`
	ReadCEL   string `json:"read_cel"`
	WriteCEL  string `json:"write_cel"`
}

// ViewSchema represents a view in the artifact.
type ViewSchema struct {
	Name         string   `json:"name"`
	Source       string   `json:"source"`
	Fields       []string `json:"fields"`
	Query        string   `json:"query"`
	Dependencies []string `json:"dependencies"`
}

// JobSchema represents a job in the artifact.
type JobSchema struct {
	Name         string   `json:"name"`
	InputEntity  string   `json:"input_entity"`
	NeedsPath    string   `json:"needs_path,omitempty"`
	NeedsFilter  string   `json:"needs_filter,omitempty"`
	Capabilities []string `json:"capabilities"`
}

// HookSchema represents a hook in the artifact.
type HookSchema struct {
	Entity    string   `json:"entity"`
	Timing    string   `json:"timing"`
	Operation string   `json:"operation"`
	Jobs      []string `json:"jobs"`
}

// MessageSchema represents a message in the artifact.
type MessageSchema struct {
	Code    string `json:"code"`
	Level   string `json:"level"`
	Default string `json:"default"`
}

// WebhookSchema represents a webhook in the artifact.
// The provider normalizes data to standard field names - no mappings needed.
type WebhookSchema struct {
	Name     string   `json:"name"`
	Route    string   `json:"route"`
	Provider string   `json:"provider"`
	Events   []string `json:"events"`
	Action   string   `json:"action"`
}

// MigrationSchema represents the migration plan in the artifact.
type MigrationSchema struct {
	Version string   `json:"version"`
	Up      []string `json:"up"`
	Down    []string `json:"down"`
}

// Output contains all emitter outputs.
type Output struct {
	Artifact     *Artifact
	ArtifactJSON string
	SchemaSQL    string
	TypeScriptClient string
	TypeScriptReact  string
}

// Emitter generates outputs from the compiled plan.
type Emitter struct {
	scope      *analyzer.Scope
	normalized *normalizer.Output
	plan       *planner.Plan
	diag       *diag.Diagnostics
}

// New creates a new Emitter.
func New(scope *analyzer.Scope, normalized *normalizer.Output, plan *planner.Plan) *Emitter {
	return &Emitter{
		scope:      scope,
		normalized: normalized,
		plan:       plan,
		diag:       diag.New(),
	}
}

// Emit generates all outputs.
func (e *Emitter) Emit() (*Output, *diag.Diagnostics) {
	out := &Output{}

	// Generate artifact
	out.Artifact = e.generateArtifact()

	// Serialize artifact to JSON
	artifactJSON, err := json.MarshalIndent(out.Artifact, "", "  ")
	if err != nil {
		e.diag.AddErrorAt(diag.Range{}.Start, "E9001", fmt.Sprintf("failed to serialize artifact: %v", err))
	} else {
		out.ArtifactJSON = string(artifactJSON)
	}

	// Generate PostgreSQL schema
	out.SchemaSQL = e.generateSchemaSQL()

	// Generate TypeScript client
	out.TypeScriptClient = e.generateTypeScriptClient()

	// Generate TypeScript React hooks
	out.TypeScriptReact = e.generateTypeScriptReact()

	return out, e.diag
}

func (e *Emitter) generateArtifact() *Artifact {
	artifact := &Artifact{
		Version:  "1.0.0",
		AppName:  e.normalized.AppName,
		Auth:     e.normalized.Auth,
		Database: e.normalized.Database,
		Entities: make(map[string]*EntitySchema),
		Actions:  make(map[string]*ActionSchema),
		Access:   make(map[string]*AccessSchema),
		Views:    make(map[string]*ViewSchema),
		Jobs:     make(map[string]*JobSchema),
		Webhooks: make(map[string]*WebhookSchema),
		Messages: make(map[string]*MessageSchema),
	}

	// Generate entity schemas
	for _, entity := range e.normalized.Entities {
		es := &EntitySchema{
			Name:      entity.Name,
			Table:     e.tableName(entity.Name),
			Fields:    make(map[string]*FieldSchema),
			Relations: make(map[string]*RelSchema),
		}

		for _, field := range entity.Fields {
			es.Fields[field.Name] = &FieldSchema{
				Name:       field.Name,
				Type:       e.forgeType(field.Type),
				SQLType:    field.Type,
				Nullable:   field.Nullable,
				Unique:     field.Unique,
				Default:    field.Default,
				EnumValues: field.EnumValues,
				MaxLength:  field.MaxLength,
			}
		}

		for _, rel := range entity.Relations {
			es.Relations[rel.Name] = &RelSchema{
				Name:        rel.Name,
				Target:      rel.Target,
				TargetTable: e.tableName(rel.Target),
				ForeignKey:  fmt.Sprintf("%s_id", rel.Name),
				IsMany:      rel.IsMany,
				OnDelete:    rel.OnDelete,
			}
		}

		artifact.Entities[entity.Name] = es
	}

	// Generate action schemas
	for name, action := range e.plan.Actions {
		as := &ActionSchema{
			Name:        name,
			InputEntity: action.InputEntity,
		}

		for _, rule := range action.Rules {
			as.Rules = append(as.Rules, rule.Entity+"_"+rule.Operation)
		}

		artifact.Actions[name] = as
	}

	// Generate rule schemas
	ruleID := 0
	for _, rule := range e.normalized.Rules {
		ruleID++
		artifact.Rules = append(artifact.Rules, &RuleSchema{
			ID:           fmt.Sprintf("rule_%d", ruleID),
			Entity:       rule.Entity,
			Operation:    rule.Operation,
			Condition:    rule.Condition,
			SQLPredicate: e.conditionToSQL(rule.Condition, rule.IsForbid),
			EmitCode:     rule.EmitCode,
			IsForbid:     rule.IsForbid,
		})
	}

	// Generate access schemas
	for entity, access := range e.plan.Access {
		artifact.Access[entity] = &AccessSchema{
			Entity:   entity,
			Table:    e.tableName(entity),
			ReadSQL:  access.ReadSQL,
			WriteSQL: access.WriteSQL,
			ReadCEL:  access.ReadCEL,
			WriteCEL: access.WriteCEL,
		}
	}

	// Generate view schemas
	for name, view := range e.plan.Views {
		artifact.Views[name] = &ViewSchema{
			Name:         name,
			Source:       view.Source,
			Fields:       view.Fields,
			Query:        view.Query,
			Dependencies: view.Dependencies,
		}
	}

	// Generate job schemas
	for _, job := range e.normalized.Jobs {
		artifact.Jobs[job.Name] = &JobSchema{
			Name:         job.Name,
			InputEntity:  job.InputType,
			NeedsPath:    job.NeedsPath,
			NeedsFilter:  job.NeedsFilter,
			Capabilities: job.Capabilities,
		}
	}

	// Generate hook schemas
	for _, hook := range e.plan.Hooks {
		artifact.Hooks = append(artifact.Hooks, &HookSchema{
			Entity:    hook.Entity,
			Timing:    hook.Timing,
			Operation: hook.Operation,
			Jobs:      hook.Jobs,
		})
	}

	// Generate message schemas
	for code, msg := range e.normalized.Messages {
		artifact.Messages[code] = &MessageSchema{
			Code:    code,
			Level:   msg.Level,
			Default: msg.Default,
		}
	}

	// Generate webhook schemas
	for name, webhook := range e.scope.Webhooks {
		ws := &WebhookSchema{
			Name:     name,
			Route:    fmt.Sprintf("/webhooks/%s", name),
			Provider: webhook.Provider.Name,
		}

		// Add events
		for _, event := range webhook.Events {
			ws.Events = append(ws.Events, event.Name)
		}

		// Add triggered action
		if webhook.Triggers != nil {
			ws.Action = webhook.Triggers.Name
		}

		artifact.Webhooks[name] = ws
	}

	// Generate migration schema
	artifact.Migration = e.generateMigrationSchema()

	return artifact
}

func (e *Emitter) generateMigrationSchema() *MigrationSchema {
	if e.plan.Migration == nil {
		return nil
	}

	m := &MigrationSchema{
		Version: e.plan.Migration.Version,
	}

	var upStatements []string
	var downStatements []string

	// Enable RLS extension and helper functions
	upStatements = append(upStatements, "-- Enable required extensions")
	upStatements = append(upStatements, "CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";")
	upStatements = append(upStatements, "")
	upStatements = append(upStatements, "-- Helper function for updated_at")
	upStatements = append(upStatements, `CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;`)
	upStatements = append(upStatements, "")

	// Create enum types
	for _, ct := range e.plan.Migration.CreateTypes {
		if ct.Kind == "enum" {
			upStatements = append(upStatements, fmt.Sprintf(
				"CREATE TYPE %s AS ENUM (%s);",
				ct.Name,
				e.formatEnumValues(ct.Values),
			))
			downStatements = append([]string{fmt.Sprintf("DROP TYPE IF EXISTS %s;", ct.Name)}, downStatements...)
		}
	}
	upStatements = append(upStatements, "")

	// Create tables
	for _, table := range e.plan.Migration.CreateTables {
		stmt := e.generateCreateTable(table)
		upStatements = append(upStatements, stmt)
		downStatements = append([]string{fmt.Sprintf("DROP TABLE IF EXISTS %s CASCADE;", table.Name)}, downStatements...)
	}
	upStatements = append(upStatements, "")

	// Create indexes
	for _, idx := range e.plan.Migration.CreateIndexes {
		uniqueStr := ""
		if idx.Unique {
			uniqueStr = "UNIQUE "
		}
		upStatements = append(upStatements, fmt.Sprintf(
			"CREATE %sINDEX IF NOT EXISTS %s ON %s (%s);",
			uniqueStr,
			idx.Name,
			idx.Table,
			strings.Join(idx.Columns, ", "),
		))
		downStatements = append([]string{fmt.Sprintf("DROP INDEX IF EXISTS %s;", idx.Name)}, downStatements...)
	}
	upStatements = append(upStatements, "")

	// Enable RLS on tables
	for _, table := range e.plan.Migration.CreateTables {
		upStatements = append(upStatements, fmt.Sprintf("ALTER TABLE %s ENABLE ROW LEVEL SECURITY;", table.Name))
	}
	upStatements = append(upStatements, "")

	// Create policies
	for _, policy := range e.plan.Migration.CreatePolicies {
		stmt := fmt.Sprintf("CREATE POLICY %s ON %s FOR %s USING (%s)",
			policy.Name, policy.Table, policy.Command, policy.Using)
		if policy.WithCheck != "" {
			stmt += fmt.Sprintf(" WITH CHECK (%s)", policy.WithCheck)
		}
		stmt += ";"
		upStatements = append(upStatements, stmt)
		downStatements = append([]string{fmt.Sprintf("DROP POLICY IF EXISTS %s ON %s;", policy.Name, policy.Table)}, downStatements...)
	}
	upStatements = append(upStatements, "")

	// Create triggers
	for _, trigger := range e.plan.Migration.CreateTriggers {
		upStatements = append(upStatements, fmt.Sprintf(
			"CREATE TRIGGER %s %s %s ON %s FOR EACH ROW EXECUTE FUNCTION %s;",
			trigger.Name, trigger.Timing, trigger.Event, trigger.Table, trigger.Function,
		))
		downStatements = append([]string{fmt.Sprintf("DROP TRIGGER IF EXISTS %s ON %s;", trigger.Name, trigger.Table)}, downStatements...)
	}

	m.Up = upStatements
	m.Down = downStatements

	return m
}

func (e *Emitter) generateCreateTable(table *planner.CreateTable) string {
	var columns []string

	for _, col := range table.Columns {
		colDef := fmt.Sprintf("    %s %s", col.Name, col.Type)

		if !col.Nullable {
			colDef += " NOT NULL"
		}

		if col.Default != "" {
			colDef += fmt.Sprintf(" DEFAULT %s", col.Default)
		}

		if col.References != nil {
			colDef += fmt.Sprintf(" REFERENCES %s(%s) ON DELETE %s",
				col.References.Table, col.References.Column, col.References.OnDelete)
		}

		columns = append(columns, colDef)
	}

	// Add primary key
	columns = append(columns, fmt.Sprintf("    PRIMARY KEY (%s)", table.PrimaryKey))

	return fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (\n%s\n);",
		table.Name,
		strings.Join(columns, ",\n"))
}

func (e *Emitter) generateSchemaSQL() string {
	if e.plan.Migration == nil {
		return ""
	}

	schema := e.generateMigrationSchema()
	return strings.Join(schema.Up, "\n")
}

func (e *Emitter) generateTypeScriptClient() string {
	var b strings.Builder

	b.WriteString("// Auto-generated by FORGE compiler - DO NOT EDIT\n")
	b.WriteString("// @forge/client\n\n")

	// Generate types for entities
	b.WriteString("// Entity Types\n")
	for _, entity := range e.normalized.Entities {
		b.WriteString(fmt.Sprintf("export interface %s {\n", entity.Name))
		for _, field := range entity.Fields {
			tsType := e.toTypeScriptType(field.Type, field.EnumValues)
			nullable := ""
			if field.Nullable {
				nullable = "?"
			}
			b.WriteString(fmt.Sprintf("  %s%s: %s;\n", field.Name, nullable, tsType))
		}
		for _, rel := range entity.Relations {
			if rel.IsMany {
				b.WriteString(fmt.Sprintf("  %s?: %s[];\n", rel.Name, rel.Target))
			} else {
				b.WriteString(fmt.Sprintf("  %s?: %s;\n", rel.Name, rel.Target))
			}
			b.WriteString(fmt.Sprintf("  %s_id: string;\n", rel.Name))
		}
		b.WriteString("}\n\n")
	}

	// Generate action input types
	b.WriteString("// Action Input Types\n")
	for _, action := range e.normalized.Actions {
		b.WriteString(fmt.Sprintf("export interface %sInput {\n", e.pascalCase(action.Name)))
		if action.InputType != "" {
			b.WriteString(fmt.Sprintf("  %s: %s | string;\n", e.camelCase(action.InputType), action.InputType))
		}
		b.WriteString("}\n\n")
	}

	// Generate view types
	b.WriteString("// View Types\n")
	for _, view := range e.normalized.Views {
		b.WriteString(fmt.Sprintf("export interface %sItem {\n", view.Name))
		for _, field := range view.Fields {
			b.WriteString(fmt.Sprintf("  %s: any;\n", field))
		}
		b.WriteString("}\n\n")
	}

	// Generate message codes
	b.WriteString("// Message Codes\n")
	b.WriteString("export const MessageCodes = {\n")
	for code, msg := range e.normalized.Messages {
		b.WriteString(fmt.Sprintf("  %s: '%s', // %s\n", code, code, msg.Default))
	}
	b.WriteString("} as const;\n\n")
	b.WriteString("export type MessageCode = keyof typeof MessageCodes;\n\n")

	// Generate client class
	b.WriteString(`// Client Configuration
export interface ForgeClientConfig {
  url: string;
  token?: string;
  onError?: (error: ForgeError) => void;
}

// Error Type
export interface ForgeError {
  status: 'error';
  messages: { code: MessageCode; message?: string }[];
}

// Success Response
export interface ForgeResponse<T> {
  status: 'ok';
  data: T;
}

// Subscription Options
export interface SubscriptionOptions<T> {
  onData: (data: T[]) => void;
  onError?: (error: ForgeError) => void;
}

// Forge Client
export class ForgeClient {
  private config: ForgeClientConfig;
  private ws: WebSocket | null = null;

  constructor(config: ForgeClientConfig) {
    this.config = config;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(` + "`${this.config.url}${path}`" + `, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.token ? { 'Authorization': ` + "`Bearer ${this.config.token}`" + ` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    if (data.status === 'error') {
      if (this.config.onError) {
        this.config.onError(data);
      }
      throw data;
    }

    return data.data;
  }

  // Actions
  actions = {
`)

	// Generate action methods
	for _, action := range e.normalized.Actions {
		methodName := e.camelCase(action.Name)
		inputType := e.pascalCase(action.Name) + "Input"
		b.WriteString(fmt.Sprintf("    %s: (input: %s) => this.request<void>('POST', '/actions/%s', input),\n",
			methodName, inputType, action.Name))
	}

	b.WriteString(`  };

  // Views
  views = {
`)

	// Generate view methods
	for _, view := range e.normalized.Views {
		methodName := e.camelCase(view.Name)
		itemType := view.Name + "Item"
		b.WriteString(fmt.Sprintf("    %s: () => this.request<%s[]>('GET', '/views/%s'),\n",
			methodName, itemType, view.Name))
	}

	b.WriteString(`  };

  // Subscriptions
  subscribe<T>(viewName: string, options: SubscriptionOptions<T>): () => void {
    const wsUrl = this.config.url.replace('http', 'ws') + '/ws';
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ type: 'subscribe', view: viewName }));
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'data') {
        options.onData(data.items);
      } else if (data.type === 'error' && options.onError) {
        options.onError(data);
      }
    };

    return () => {
      this.ws?.close();
      this.ws = null;
    };
  }
}
`)

	return b.String()
}

func (e *Emitter) generateTypeScriptReact() string {
	var b strings.Builder

	b.WriteString("// Auto-generated by FORGE compiler - DO NOT EDIT\n")
	b.WriteString("// @forge/react\n\n")

	b.WriteString("import { useEffect, useState, useCallback, useContext, createContext } from 'react';\n")
	b.WriteString("import type { ForgeClient, ForgeError, MessageCode } from '@forge/client';\n\n")

	// Generate imports for entity types
	b.WriteString("import type {\n")
	for _, entity := range e.normalized.Entities {
		b.WriteString(fmt.Sprintf("  %s,\n", entity.Name))
	}
	for _, view := range e.normalized.Views {
		b.WriteString(fmt.Sprintf("  %sItem,\n", view.Name))
	}
	for _, action := range e.normalized.Actions {
		b.WriteString(fmt.Sprintf("  %sInput,\n", e.pascalCase(action.Name)))
	}
	b.WriteString("} from '@forge/client';\n\n")

	// Context
	b.WriteString(`// Forge Context
const ForgeContext = createContext<ForgeClient | null>(null);

export function ForgeProvider({ client, children }: { client: ForgeClient; children: React.ReactNode }) {
  return <ForgeContext.Provider value={client}>{children}</ForgeContext.Provider>;
}

function useForge(): ForgeClient {
  const client = useContext(ForgeContext);
  if (!client) {
    throw new Error('useForge must be used within a ForgeProvider');
  }
  return client;
}

// Generic hook result type
interface UseQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: ForgeError | undefined;
  refetch: () => Promise<void>;
}

interface UseActionResult<TInput> {
  execute: (input: TInput) => Promise<void>;
  loading: boolean;
  error: ForgeError | undefined;
}

`)

	// Generate hooks for views
	b.WriteString("// View Hooks\n")
	for _, view := range e.normalized.Views {
		hookName := fmt.Sprintf("use%s", view.Name)
		itemType := view.Name + "Item"

		b.WriteString(fmt.Sprintf(`export function %s(): UseQueryResult<%s[]> {
  const client = useForge();
  const [data, setData] = useState<%s[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.views.%s();
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = client.subscribe<%s>('%s', {
      onData: setData,
      onError: setError,
    });
    return unsubscribe;
  }, [client]);

  return { data, loading, error, refetch: fetch };
}

`, hookName, itemType, itemType, e.camelCase(view.Name), itemType, view.Name))
	}

	// Generate hooks for actions
	b.WriteString("// Action Hooks\n")
	for _, action := range e.normalized.Actions {
		hookName := fmt.Sprintf("use%s", e.pascalCase(action.Name))
		inputType := e.pascalCase(action.Name) + "Input"

		b.WriteString(fmt.Sprintf(`export function %s(): UseActionResult<%s> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(async (input: %s) => {
    setLoading(true);
    setError(undefined);
    try {
      await client.actions.%s(input);
    } catch (e) {
      setError(e as ForgeError);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { execute, loading, error };
}

`, hookName, inputType, inputType, e.camelCase(action.Name)))
	}

	// Generic useList and useAction
	b.WriteString(`// Generic hooks for dynamic view/action names
export function useList<T>(viewName: string): UseQueryResult<T[]> {
  const client = useForge();
  const [data, setData] = useState<T[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await (client.views as any)[viewName]();
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client, viewName]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    const unsubscribe = client.subscribe<T>(viewName, {
      onData: setData,
      onError: setError,
    });
    return unsubscribe;
  }, [client, viewName]);

  return { data, loading, error, refetch: fetch };
}

export function useAction<TInput>(actionName: string): UseActionResult<TInput> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(async (input: TInput) => {
    setLoading(true);
    setError(undefined);
    try {
      await (client.actions as any)[actionName](input);
    } catch (e) {
      setError(e as ForgeError);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [client, actionName]);

  return { execute, loading, error };
}
`)

	return b.String()
}

func (e *Emitter) tableName(entityName string) string {
	var result []rune
	for i, r := range entityName {
		if i > 0 && r >= 'A' && r <= 'Z' {
			result = append(result, '_')
		}
		result = append(result, r)
	}
	return strings.ToLower(string(result)) + "s"
}

func (e *Emitter) forgeType(sqlType string) string {
	switch sqlType {
	case "text":
		return "string"
	case "integer":
		return "int"
	case "double precision":
		return "float"
	case "boolean":
		return "bool"
	case "timestamp with time zone":
		return "time"
	case "uuid":
		return "uuid"
	default:
		return sqlType
	}
}

func (e *Emitter) toTypeScriptType(forgeType string, enumValues []string) string {
	switch forgeType {
	case "text", "string":
		return "string"
	case "integer", "int", "double precision", "float":
		return "number"
	case "boolean", "bool":
		return "boolean"
	case "timestamp with time zone", "time":
		return "string" // ISO date string
	case "uuid":
		return "string"
	case "enum":
		if len(enumValues) > 0 {
			quoted := make([]string, len(enumValues))
			for i, v := range enumValues {
				quoted[i] = fmt.Sprintf("'%s'", v)
			}
			return strings.Join(quoted, " | ")
		}
		return "string"
	default:
		return "any"
	}
}

func (e *Emitter) formatEnumValues(values []string) string {
	quoted := make([]string, len(values))
	for i, v := range values {
		quoted[i] = fmt.Sprintf("'%s'", v)
	}
	return strings.Join(quoted, ", ")
}

func (e *Emitter) conditionToSQL(celExpr string, isForbid bool) string {
	if isForbid && celExpr != "" {
		return fmt.Sprintf("NOT (%s)", celExpr)
	}
	return celExpr
}

func (e *Emitter) pascalCase(s string) string {
	parts := strings.Split(s, "_")
	for i, part := range parts {
		if len(part) > 0 {
			parts[i] = strings.ToUpper(part[:1]) + part[1:]
		}
	}
	return strings.Join(parts, "")
}

func (e *Emitter) camelCase(s string) string {
	pascal := e.pascalCase(s)
	if len(pascal) > 0 {
		return strings.ToLower(pascal[:1]) + pascal[1:]
	}
	return pascal
}

// Emit is a convenience function.
func Emit(scope *analyzer.Scope, normalized *normalizer.Output, plan *planner.Plan) (*Output, *diag.Diagnostics) {
	e := New(scope, normalized, plan)
	return e.Emit()
}
