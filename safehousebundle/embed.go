// Package safehousebundle embeds the 萌萌的安全小屋 (Mengmeng's Safe House)
// downloads produced by `go run ./cmd/pack` in the safehouse module. A build
// without them still compiles; the console then reports that the local
// program is not included.
package safehousebundle

import (
	"embed"
	"io/fs"
)

//go:embed all:artifacts
var artifacts embed.FS

// Files returns the artifact directory as the root of the file system.
func Files() fs.FS {
	files, err := fs.Sub(artifacts, "artifacts")
	if err != nil {
		panic(err)
	}
	return files
}
