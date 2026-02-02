module github.com/forge-lang/forge/runtime

go 1.22

require (
	github.com/go-chi/chi/v5 v5.0.12
	github.com/gorilla/websocket v1.5.1
)

require golang.org/x/net v0.17.0 // indirect

replace github.com/forge-lang/forge/compiler => ../compiler
