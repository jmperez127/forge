module github.com/forge-lang/forge/runtime

go 1.22

require (
	github.com/forge-lang/forge/compiler v0.0.0
	github.com/go-chi/chi/v5 v5.0.12
	github.com/google/cel-go v0.20.1
	github.com/gorilla/websocket v1.5.1
	github.com/hibiken/asynq v0.24.1
	github.com/jackc/pgx/v5 v5.5.5
)

replace github.com/forge-lang/forge/compiler => ../compiler
