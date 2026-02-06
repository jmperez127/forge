// Package server provides the FORGE HTTP and WebSocket server.
package server

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"os"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/forge-lang/forge/runtime/internal/provider"
)

// DevInfo holds all development info data
type DevInfo struct {
	App       AppInfo       `json:"app"`
	Runtime   RuntimeInfo   `json:"runtime"`
	Build     BuildInfo     `json:"build"`
	Stats     StatsInfo     `json:"stats"`
}

// AppInfo holds application metadata
type AppInfo struct {
	Name     string `json:"name"`
	Version  string `json:"version"`
	Auth     string `json:"auth"`
	Database string `json:"database"`
}

// RuntimeInfo holds runtime environment info
type RuntimeInfo struct {
	ForgeVersion string `json:"forge_version"`
	GoVersion    string `json:"go_version"`
	Environment  string `json:"environment"`
	StartedAt    string `json:"started_at"`
	UptimeSeconds int64 `json:"uptime_seconds"`
}

// BuildInfo holds build metadata
type BuildInfo struct {
	ArtifactPath string `json:"artifact_path"`
}

// StatsInfo holds runtime statistics
type StatsInfo struct {
	Entities  int `json:"entities"`
	Actions   int `json:"actions"`
	Rules     int `json:"rules"`
	Views     int `json:"views"`
	Jobs      int `json:"jobs"`
	Hooks     int `json:"hooks"`
	Webhooks  int `json:"webhooks"`
	Messages  int `json:"messages"`
}

// RouteInfo describes an API route
type RouteInfo struct {
	Method   string `json:"method"`
	Path     string `json:"path"`
	Handler  string `json:"handler"`
	Access   string `json:"access,omitempty"`
	Category string `json:"category,omitempty"`
}

// ConfigInfo holds masked configuration
type ConfigInfo struct {
	Database    map[string]interface{} `json:"database"`
	Auth        map[string]interface{} `json:"auth,omitempty"`
	Environment string                 `json:"environment"`
}

// DatabaseInfo holds database status
type DatabaseInfo struct {
	Adapter    string `json:"adapter"`
	Status     string `json:"status"`
	Embedded   bool   `json:"embedded"`
	DataDir    string `json:"data_dir,omitempty"`
	MigrationVersion string `json:"migration_version,omitempty"`
	Tables     []string `json:"tables,omitempty"`
}

// WebSocketInfo holds WebSocket stats
type WebSocketInfo struct {
	Status        string         `json:"status"`
	Connections   int            `json:"connections"`
	Subscriptions map[string]int `json:"subscriptions"`
}

var serverStartTime = time.Now()

// isDevMode checks if we're running in development mode
func isDevMode() bool {
	env := os.Getenv("FORGE_ENV")
	return env == "" || env == "development"
}

// setupDevRoutes registers development info routes (only in dev mode)
func (s *Server) setupDevRoutes() {
	if !isDevMode() {
		return
	}

	s.router.Route("/_dev", func(r chi.Router) {
		r.Get("/", s.handleDevDashboard)
		r.Get("/info", s.handleDevInfo)
		r.Get("/routes", s.handleDevRoutes)
		r.Get("/schema", s.handleDevSchema)
		r.Get("/actions", s.handleDevActions)
		r.Get("/rules", s.handleDevRules)
		r.Get("/access", s.handleDevAccess)
		r.Get("/views", s.handleDevViews)
		r.Get("/jobs", s.handleDevJobs)
		r.Get("/webhooks", s.handleDevWebhooks)
		r.Get("/messages", s.handleDevMessages)
		r.Get("/database", s.handleDevDatabase)
		r.Get("/websocket", s.handleDevWebSocket)
		r.Get("/config", s.handleDevConfig)
	})

	s.logger.Info("development info pages enabled at /_dev")
}

// wantsHTML checks if the client prefers HTML
func wantsHTML(r *http.Request) bool {
	accept := r.Header.Get("Accept")
	return strings.Contains(accept, "text/html")
}

// respondDevJSON sends JSON response for dev endpoints
func (s *Server) respondDevJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	enc.Encode(data)
}

// respondDevHTML sends HTML response for dev endpoints
func (s *Server) respondDevHTML(w http.ResponseWriter, title string, data interface{}) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	jsonData, _ := json.MarshalIndent(data, "", "  ")

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
    <title>%s - FORGE Dev</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            margin: 0; padding: 20px; background: #0d1117; color: #c9d1d9;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #58a6ff; margin-bottom: 5px; }
        h2 { color: #8b949e; font-weight: normal; margin-top: 0; }
        nav { background: #161b22; padding: 10px 15px; border-radius: 6px; margin-bottom: 20px; }
        nav a { color: #58a6ff; text-decoration: none; margin-right: 15px; }
        nav a:hover { text-decoration: underline; }
        pre {
            background: #161b22; padding: 15px; border-radius: 6px;
            overflow-x: auto; font-size: 13px; line-height: 1.5;
        }
        .json-key { color: #7ee787; }
        .json-string { color: #a5d6ff; }
        .json-number { color: #79c0ff; }
        .json-boolean { color: #ff7b72; }
        .json-null { color: #8b949e; }
        table { width: 100%%; border-collapse: collapse; margin-top: 15px; }
        th, td { text-align: left; padding: 10px; border-bottom: 1px solid #30363d; }
        th { background: #161b22; color: #8b949e; font-weight: 600; }
        tr:hover { background: #161b22; }
        .method { font-weight: bold; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
        .method-get { background: #238636; color: white; }
        .method-post { background: #1f6feb; color: white; }
        .method-put { background: #9e6a03; color: white; }
        .method-delete { background: #da3633; color: white; }
        .method-ws { background: #8957e5; color: white; }
        code { background: #30363d; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 12px; margin-right: 5px; }
        .badge-entity { background: #238636; color: white; }
        .badge-action { background: #1f6feb; color: white; }
        .badge-view { background: #8957e5; color: white; }
        .badge-rule { background: #9e6a03; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <h1>%s</h1>
        <h2>%s Development Info</h2>
        <nav>
            <a href="/_dev">Dashboard</a>
            <a href="/_dev/info">Info</a>
            <a href="/_dev/routes">Routes</a>
            <a href="/_dev/schema">Schema</a>
            <a href="/_dev/actions">Actions</a>
            <a href="/_dev/rules">Rules</a>
            <a href="/_dev/access">Access</a>
            <a href="/_dev/views">Views</a>
            <a href="/_dev/jobs">Jobs</a>
            <a href="/_dev/webhooks">Webhooks</a>
            <a href="/_dev/messages">Messages</a>
            <a href="/_dev/database">Database</a>
            <a href="/_dev/websocket">WebSocket</a>
            <a href="/_dev/config">Config</a>
        </nav>
        <pre>%s</pre>
    </div>
</body>
</html>`, title, title, s.artifact.AppName, template.HTMLEscapeString(string(jsonData)))

	w.Write([]byte(html))
}

// handleDevDashboard shows the main dev dashboard
func (s *Server) handleDevDashboard(w http.ResponseWriter, r *http.Request) {
	info := s.getDevInfo()

	if wantsHTML(r) {
		s.respondDevDashboardHTML(w, info)
		return
	}

	s.respondDevJSON(w, info)
}

func (s *Server) respondDevDashboardHTML(w http.ResponseWriter, info *DevInfo) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
    <title>Dev Dashboard - FORGE</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            margin: 0; padding: 20px; background: #0d1117; color: #c9d1d9;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #58a6ff; margin-bottom: 5px; font-size: 28px; }
        h2 { color: #8b949e; font-weight: normal; margin-top: 0; font-size: 16px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 15px; margin-top: 20px; }
        .card {
            background: #161b22; padding: 20px; border-radius: 6px;
            border: 1px solid #30363d; text-decoration: none; color: inherit;
            transition: border-color 0.2s;
        }
        .card:hover { border-color: #58a6ff; }
        .card h3 { margin: 0 0 10px 0; color: #58a6ff; font-size: 16px; }
        .card p { margin: 0; color: #8b949e; font-size: 14px; }
        .card .count { font-size: 32px; font-weight: bold; color: #c9d1d9; margin-bottom: 5px; }
        .stats { display: flex; gap: 30px; margin-top: 20px; flex-wrap: wrap; }
        .stat { text-align: center; }
        .stat-value { font-size: 24px; font-weight: bold; color: #58a6ff; }
        .stat-label { font-size: 12px; color: #8b949e; text-transform: uppercase; }
        .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #30363d; }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: #8b949e; }
        .info-value { color: #c9d1d9; font-family: monospace; }
        .section { margin-top: 30px; }
        .section-title { color: #8b949e; font-size: 12px; text-transform: uppercase; margin-bottom: 15px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>%s</h1>
        <h2>FORGE Development Dashboard</h2>

        <div class="stats">
            <div class="stat">
                <div class="stat-value">%d</div>
                <div class="stat-label">Entities</div>
            </div>
            <div class="stat">
                <div class="stat-value">%d</div>
                <div class="stat-label">Actions</div>
            </div>
            <div class="stat">
                <div class="stat-value">%d</div>
                <div class="stat-label">Views</div>
            </div>
            <div class="stat">
                <div class="stat-value">%d</div>
                <div class="stat-label">Rules</div>
            </div>
            <div class="stat">
                <div class="stat-value">%d</div>
                <div class="stat-label">Jobs</div>
            </div>
            <div class="stat">
                <div class="stat-value">%d</div>
                <div class="stat-label">Webhooks</div>
            </div>
            <div class="stat">
                <div class="stat-value">%d</div>
                <div class="stat-label">Messages</div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Application Info</div>
            <div class="card">
                <div class="info-row">
                    <span class="info-label">App Name</span>
                    <span class="info-value">%s</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Version</span>
                    <span class="info-value">%s</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Auth</span>
                    <span class="info-value">%s</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Database</span>
                    <span class="info-value">%s</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Environment</span>
                    <span class="info-value">%s</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Go Version</span>
                    <span class="info-value">%s</span>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Quick Links</div>
            <div class="grid">
                <a href="/_dev/routes" class="card">
                    <h3>Routes</h3>
                    <p>View all API endpoints with methods and access rules</p>
                </a>
                <a href="/_dev/schema" class="card">
                    <h3>Schema</h3>
                    <p>Entity definitions with fields and relations</p>
                </a>
                <a href="/_dev/actions" class="card">
                    <h3>Actions</h3>
                    <p>Available actions with input entities and rules</p>
                </a>
                <a href="/_dev/rules" class="card">
                    <h3>Rules</h3>
                    <p>Business rules with SQL predicates</p>
                </a>
                <a href="/_dev/access" class="card">
                    <h3>Access Control</h3>
                    <p>Read/write policies for each entity</p>
                </a>
                <a href="/_dev/views" class="card">
                    <h3>Views</h3>
                    <p>View projections and dependencies</p>
                </a>
                <a href="/_dev/jobs" class="card">
                    <h3>Jobs & Hooks</h3>
                    <p>Background jobs and lifecycle hooks</p>
                </a>
                <a href="/_dev/webhooks" class="card">
                    <h3>Webhooks</h3>
                    <p>Inbound webhook endpoints and event mappings</p>
                </a>
                <a href="/_dev/messages" class="card">
                    <h3>Messages</h3>
                    <p>Error and info message codes</p>
                </a>
                <a href="/_dev/database" class="card">
                    <h3>Database</h3>
                    <p>Connection status and migration info</p>
                </a>
                <a href="/_dev/websocket" class="card">
                    <h3>WebSocket</h3>
                    <p>Real-time connection statistics</p>
                </a>
                <a href="/_dev/config" class="card">
                    <h3>Config</h3>
                    <p>Runtime configuration (secrets masked)</p>
                </a>
            </div>
        </div>
    </div>
</body>
</html>`,
		info.App.Name,
		info.Stats.Entities, info.Stats.Actions, info.Stats.Views,
		info.Stats.Rules, info.Stats.Jobs, info.Stats.Webhooks, info.Stats.Messages,
		info.App.Name, info.App.Version, info.App.Auth, info.App.Database,
		info.Runtime.Environment, info.Runtime.GoVersion,
	)

	w.Write([]byte(html))
}

func (s *Server) getDevInfo() *DevInfo {
	env := os.Getenv("FORGE_ENV")
	if env == "" {
		env = "development"
	}

	return &DevInfo{
		App: AppInfo{
			Name:     s.artifact.AppName,
			Version:  s.artifact.Version,
			Auth:     s.artifact.Auth,
			Database: s.artifact.Database,
		},
		Runtime: RuntimeInfo{
			ForgeVersion:  "0.1.0",
			GoVersion:     runtime.Version(),
			Environment:   env,
			StartedAt:     serverStartTime.Format(time.RFC3339),
			UptimeSeconds: int64(time.Since(serverStartTime).Seconds()),
		},
		Build: BuildInfo{
			ArtifactPath: s.config.ArtifactPath,
		},
		Stats: StatsInfo{
			Entities: len(s.artifact.Entities),
			Actions:  len(s.artifact.Actions),
			Rules:    len(s.artifact.Rules),
			Views:    len(s.artifact.Views),
			Jobs:     len(s.artifact.Jobs),
			Hooks:    len(s.artifact.Hooks),
			Webhooks: len(s.artifact.Webhooks),
			Messages: len(s.artifact.Messages),
		},
	}
}

// handleDevInfo returns app metadata
func (s *Server) handleDevInfo(w http.ResponseWriter, r *http.Request) {
	info := s.getDevInfo()

	if wantsHTML(r) {
		s.respondDevHTML(w, "App Info", info)
		return
	}

	s.respondDevJSON(w, info)
}

// handleDevRoutes returns all API routes
func (s *Server) handleDevRoutes(w http.ResponseWriter, r *http.Request) {
	routes := s.getRoutes()

	if wantsHTML(r) {
		s.respondDevRoutesHTML(w, routes)
		return
	}

	s.respondDevJSON(w, map[string]interface{}{"routes": routes})
}

func (s *Server) getRoutes() []RouteInfo {
	var routes []RouteInfo

	// 1. System routes first
	routes = append(routes, RouteInfo{
		Method: "GET", Path: "/health", Handler: "health",
		Access: "public", Category: "System",
	})
	routes = append(routes, RouteInfo{
		Method: "WS", Path: "/ws", Handler: "websocket",
		Access: "authenticated", Category: "System",
	})

	// 2. Actions (sorted alphabetically)
	actionNames := make([]string, 0, len(s.artifact.Actions))
	for name := range s.artifact.Actions {
		actionNames = append(actionNames, name)
	}
	sort.Strings(actionNames)

	for _, name := range actionNames {
		access := ""
		if acc, ok := s.artifact.Access[s.artifact.Actions[name].InputEntity]; ok {
			access = "write: " + acc.WriteSQL
		}
		routes = append(routes, RouteInfo{
			Method: "POST", Path: "/api/actions/" + name,
			Handler: "action:" + name, Access: access, Category: "Actions",
		})
	}

	// 3. Views (sorted alphabetically)
	viewNames := make([]string, 0, len(s.artifact.Views))
	for name := range s.artifact.Views {
		viewNames = append(viewNames, name)
	}
	sort.Strings(viewNames)

	for _, name := range viewNames {
		access := ""
		if acc, ok := s.artifact.Access[s.artifact.Views[name].Source]; ok {
			access = "read: " + acc.ReadSQL
		}
		routes = append(routes, RouteInfo{
			Method: "GET", Path: "/api/views/" + name,
			Handler: "view:" + name, Access: access, Category: "Views",
		})
	}

	// 4. Webhooks (sorted alphabetically)
	webhookNames := make([]string, 0, len(s.artifact.Webhooks))
	for name := range s.artifact.Webhooks {
		webhookNames = append(webhookNames, name)
	}
	sort.Strings(webhookNames)

	for _, name := range webhookNames {
		webhook := s.artifact.Webhooks[name]
		access := "provider: " + webhook.Provider
		routes = append(routes, RouteInfo{
			Method: "POST", Path: "/webhooks/" + name,
			Handler: "webhook:" + name, Access: access, Category: "Webhooks",
		})
	}

	// 5. Entities (sorted alphabetically, CRUD grouped per entity)
	entityNames := make([]string, 0, len(s.artifact.Entities))
	for name := range s.artifact.Entities {
		entityNames = append(entityNames, name)
	}
	sort.Strings(entityNames)

	for _, name := range entityNames {
		readAccess := ""
		writeAccess := ""
		if acc, ok := s.artifact.Access[name]; ok {
			readAccess = acc.ReadSQL
			writeAccess = acc.WriteSQL
		}
		category := "Entities: " + name

		// CRUD in logical order: list, get, create, update, delete
		routes = append(routes, RouteInfo{
			Method: "GET", Path: "/api/entities/" + name,
			Handler: "entity:" + name + ":list", Access: "read: " + readAccess, Category: category,
		})
		routes = append(routes, RouteInfo{
			Method: "GET", Path: "/api/entities/" + name + "/{id}",
			Handler: "entity:" + name + ":get", Access: "read: " + readAccess, Category: category,
		})
		routes = append(routes, RouteInfo{
			Method: "POST", Path: "/api/entities/" + name,
			Handler: "entity:" + name + ":create", Access: "write: " + writeAccess, Category: category,
		})
		routes = append(routes, RouteInfo{
			Method: "PUT", Path: "/api/entities/" + name + "/{id}",
			Handler: "entity:" + name + ":update", Access: "write: " + writeAccess, Category: category,
		})
		routes = append(routes, RouteInfo{
			Method: "DELETE", Path: "/api/entities/" + name + "/{id}",
			Handler: "entity:" + name + ":delete", Access: "write: " + writeAccess, Category: category,
		})
	}

	return routes
}

func (s *Server) respondDevRoutesHTML(w http.ResponseWriter, routes []RouteInfo) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	var rows strings.Builder
	lastCategory := ""
	for _, route := range routes {
		// Add category header row when category changes
		if route.Category != lastCategory {
			rows.WriteString(fmt.Sprintf(`<tr class="category-row">
				<td colspan="4"><strong>%s</strong></td>
			</tr>`, template.HTMLEscapeString(route.Category)))
			lastCategory = route.Category
		}

		methodClass := "method-" + strings.ToLower(route.Method)
		access := route.Access
		if access == "" {
			access = "-"
		}
		if len(access) > 80 {
			access = access[:77] + "..."
		}
		rows.WriteString(fmt.Sprintf(`<tr>
			<td><span class="method %s">%s</span></td>
			<td><code>%s</code></td>
			<td>%s</td>
			<td><small>%s</small></td>
		</tr>`, methodClass, route.Method, route.Path, route.Handler, template.HTMLEscapeString(access)))
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
    <title>Routes - FORGE Dev</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            margin: 0; padding: 20px; background: #0d1117; color: #c9d1d9;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { color: #58a6ff; margin-bottom: 5px; }
        h2 { color: #8b949e; font-weight: normal; margin-top: 0; }
        nav { background: #161b22; padding: 10px 15px; border-radius: 6px; margin-bottom: 20px; }
        nav a { color: #58a6ff; text-decoration: none; margin-right: 15px; }
        nav a:hover { text-decoration: underline; }
        table { width: 100%%; border-collapse: collapse; margin-top: 15px; }
        th, td { text-align: left; padding: 10px; border-bottom: 1px solid #30363d; }
        th { background: #161b22; color: #8b949e; font-weight: 600; position: sticky; top: 0; }
        tr:hover { background: #161b22; }
        .category-row { background: #0d1117; }
        .category-row td { padding: 15px 10px 8px 10px; color: #58a6ff; font-size: 13px; border-bottom: 2px solid #30363d; }
        .method { font-weight: bold; padding: 2px 8px; border-radius: 3px; font-size: 11px; display: inline-block; min-width: 50px; text-align: center; }
        .method-get { background: #238636; color: white; }
        .method-post { background: #1f6feb; color: white; }
        .method-put { background: #9e6a03; color: white; }
        .method-delete { background: #da3633; color: white; }
        .method-ws { background: #8957e5; color: white; }
        code { background: #30363d; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
        small { color: #8b949e; }
        input[type="search"] {
            width: 100%%; padding: 10px; background: #0d1117; border: 1px solid #30363d;
            border-radius: 6px; color: #c9d1d9; font-size: 14px; margin-bottom: 15px;
        }
        input[type="search"]:focus { outline: none; border-color: #58a6ff; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Routes</h1>
        <h2>%s - %d routes</h2>
        <nav>
            <a href="/_dev">Dashboard</a>
            <a href="/_dev/info">Info</a>
            <a href="/_dev/routes">Routes</a>
            <a href="/_dev/schema">Schema</a>
            <a href="/_dev/actions">Actions</a>
            <a href="/_dev/rules">Rules</a>
            <a href="/_dev/access">Access</a>
            <a href="/_dev/views">Views</a>
            <a href="/_dev/jobs">Jobs</a>
            <a href="/_dev/webhooks">Webhooks</a>
            <a href="/_dev/messages">Messages</a>
            <a href="/_dev/database">Database</a>
            <a href="/_dev/websocket">WebSocket</a>
            <a href="/_dev/config">Config</a>
        </nav>
        <input type="search" id="search" placeholder="Filter routes..." onkeyup="filterRoutes()">
        <table id="routes">
            <thead>
                <tr><th>Method</th><th>Path</th><th>Handler</th><th>Access</th></tr>
            </thead>
            <tbody>%s</tbody>
        </table>
    </div>
    <script>
        function filterRoutes() {
            const filter = document.getElementById('search').value.toLowerCase();
            const rows = document.querySelectorAll('#routes tbody tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(filter) ? '' : 'none';
            });
        }
    </script>
</body>
</html>`, s.artifact.AppName, len(routes), rows.String())

	w.Write([]byte(html))
}

// handleDevSchema returns entity schema
func (s *Server) handleDevSchema(w http.ResponseWriter, r *http.Request) {
	if wantsHTML(r) {
		s.respondDevHTML(w, "Schema", map[string]interface{}{"entities": s.artifact.Entities})
		return
	}

	s.respondDevJSON(w, map[string]interface{}{"entities": s.artifact.Entities})
}

// handleDevActions returns actions
func (s *Server) handleDevActions(w http.ResponseWriter, r *http.Request) {
	if wantsHTML(r) {
		s.respondDevHTML(w, "Actions", map[string]interface{}{"actions": s.artifact.Actions})
		return
	}

	s.respondDevJSON(w, map[string]interface{}{"actions": s.artifact.Actions})
}

// handleDevRules returns business rules
func (s *Server) handleDevRules(w http.ResponseWriter, r *http.Request) {
	if wantsHTML(r) {
		s.respondDevHTML(w, "Rules", map[string]interface{}{"rules": s.artifact.Rules})
		return
	}

	s.respondDevJSON(w, map[string]interface{}{"rules": s.artifact.Rules})
}

// handleDevAccess returns access control policies
func (s *Server) handleDevAccess(w http.ResponseWriter, r *http.Request) {
	if wantsHTML(r) {
		s.respondDevHTML(w, "Access Control", map[string]interface{}{"access": s.artifact.Access})
		return
	}

	s.respondDevJSON(w, map[string]interface{}{"access": s.artifact.Access})
}

// handleDevViews returns view definitions
func (s *Server) handleDevViews(w http.ResponseWriter, r *http.Request) {
	if wantsHTML(r) {
		s.respondDevHTML(w, "Views", map[string]interface{}{"views": s.artifact.Views})
		return
	}

	s.respondDevJSON(w, map[string]interface{}{"views": s.artifact.Views})
}

// handleDevJobs returns jobs, hooks, executor status, and provider info
func (s *Server) handleDevJobs(w http.ResponseWriter, r *http.Request) {
	// Build executor info
	executorStatus := "stopped"
	executorWorkers := 0
	executorQueueCapacity := 0
	executorQueueLength := 0
	if s.executor != nil {
		executorStatus = "running"
		executorWorkers = s.executor.Workers()
		executorQueueCapacity = s.executor.QueueCapacity()
		executorQueueLength = s.executor.QueueLength()
	}

	// Build provider info from global registry
	registry := provider.Global()
	registeredProviders := registry.Providers()
	capabilities := registry.Capabilities()
	sort.Strings(registeredProviders)
	sort.Strings(capabilities)

	data := map[string]interface{}{
		"jobs":  s.artifact.Jobs,
		"hooks": s.artifact.Hooks,
		"executor": map[string]interface{}{
			"workers":        executorWorkers,
			"queue_capacity": executorQueueCapacity,
			"queue_length":   executorQueueLength,
			"status":         executorStatus,
		},
		"providers": map[string]interface{}{
			"registered":   registeredProviders,
			"capabilities": capabilities,
		},
	}

	if wantsHTML(r) {
		s.respondDevHTML(w, "Jobs & Hooks", data)
		return
	}

	s.respondDevJSON(w, data)
}

// handleDevWebhooks returns webhook definitions
func (s *Server) handleDevWebhooks(w http.ResponseWriter, r *http.Request) {
	if wantsHTML(r) {
		s.respondDevHTML(w, "Webhooks", map[string]interface{}{"webhooks": s.artifact.Webhooks})
		return
	}

	s.respondDevJSON(w, map[string]interface{}{"webhooks": s.artifact.Webhooks})
}

// handleDevMessages returns message codes
func (s *Server) handleDevMessages(w http.ResponseWriter, r *http.Request) {
	if wantsHTML(r) {
		s.respondDevHTML(w, "Messages", map[string]interface{}{"messages": s.artifact.Messages})
		return
	}

	s.respondDevJSON(w, map[string]interface{}{"messages": s.artifact.Messages})
}

// handleDevDatabase returns database status
func (s *Server) handleDevDatabase(w http.ResponseWriter, r *http.Request) {
	info := DatabaseInfo{
		Adapter:  s.runtimeConf.Database.Adapter,
		Status:   "connected",
		Embedded: s.db.IsEmbedded(),
	}

	if s.db.IsEmbedded() {
		info.DataDir = s.runtimeConf.Database.Embedded.DataDir
	}

	if s.artifact.Migration != nil {
		info.MigrationVersion = s.artifact.Migration.Version
	}

	// Get table names from entities
	tables := make([]string, 0, len(s.artifact.Entities))
	for _, entity := range s.artifact.Entities {
		tables = append(tables, entity.Table)
	}
	sort.Strings(tables)
	info.Tables = tables

	if wantsHTML(r) {
		s.respondDevHTML(w, "Database", info)
		return
	}

	s.respondDevJSON(w, info)
}

// handleDevWebSocket returns WebSocket stats
func (s *Server) handleDevWebSocket(w http.ResponseWriter, r *http.Request) {
	info := WebSocketInfo{
		Status:        "active",
		Connections:   s.hub.ClientCount(),
		Subscriptions: s.hub.SubscriptionCounts(),
	}

	if wantsHTML(r) {
		s.respondDevHTML(w, "WebSocket", info)
		return
	}

	s.respondDevJSON(w, info)
}

// handleDevConfig returns masked configuration
func (s *Server) handleDevConfig(w http.ResponseWriter, r *http.Request) {
	env := os.Getenv("FORGE_ENV")
	if env == "" {
		env = "development"
	}

	// Build masked config
	config := ConfigInfo{
		Environment: env,
		Database: map[string]interface{}{
			"adapter": s.runtimeConf.Database.Adapter,
		},
	}

	if s.runtimeConf.Database.Adapter == "embedded" {
		config.Database["data_dir"] = s.runtimeConf.Database.Embedded.DataDir
		config.Database["port"] = s.runtimeConf.Database.Embedded.Port
		config.Database["ephemeral"] = s.runtimeConf.Database.Embedded.Ephemeral
	} else if s.runtimeConf.Database.Adapter == "postgres" {
		config.Database["url"] = maskDatabaseURL(s.runtimeConf.Database.Postgres.URL)
		config.Database["pool_size"] = s.runtimeConf.Database.Postgres.PoolSize
		config.Database["ssl_mode"] = s.runtimeConf.Database.Postgres.SSLMode
	}

	if s.artifact.Auth != "" {
		config.Auth = map[string]interface{}{
			"provider": s.artifact.Auth,
		}
	}

	if wantsHTML(r) {
		s.respondDevHTML(w, "Configuration", config)
		return
	}

	s.respondDevJSON(w, config)
}

// maskDatabaseURL masks the password in a database URL
func maskDatabaseURL(url string) string {
	// postgres://user:password@host:port/db -> postgres://user:***@host:port/db
	if idx := strings.Index(url, "://"); idx != -1 {
		rest := url[idx+3:]
		if atIdx := strings.Index(rest, "@"); atIdx != -1 {
			userPass := rest[:atIdx]
			if colonIdx := strings.Index(userPass, ":"); colonIdx != -1 {
				user := userPass[:colonIdx]
				return url[:idx+3] + user + ":***" + rest[atIdx:]
			}
		}
	}
	return url
}
