module github.com/forge-lang/forge/runtime

go 1.22

require (
	github.com/BurntSushi/toml v1.3.2
	github.com/fergusstrange/embedded-postgres v1.25.0
	github.com/go-chi/chi/v5 v5.0.12
	github.com/google/uuid v1.6.0
	github.com/gorilla/websocket v1.5.1
	github.com/jackc/pgx/v5 v5.5.5
)

require (
	github.com/fsnotify/fsnotify v1.9.0 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20221227161230-091c0ba34f0a // indirect
	github.com/jackc/puddle/v2 v2.2.1 // indirect
	github.com/lib/pq v1.10.9 // indirect
	github.com/xi2/xz v0.0.0-20171230120015-48954b6210f8 // indirect
	golang.org/x/crypto v0.21.0 // indirect
	golang.org/x/net v0.21.0 // indirect
	golang.org/x/sync v0.1.0 // indirect
	golang.org/x/sys v0.18.0 // indirect
	golang.org/x/text v0.14.0 // indirect
)

replace github.com/forge-lang/forge/compiler => ../compiler
