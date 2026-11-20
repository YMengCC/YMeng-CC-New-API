// Command pack cross-compiles the safe house for every supported platform and
// writes the download artifacts the gateway embeds:
//
//	go run ./cmd/pack -out ../safehousebundle/artifacts -version v1.2.3
//
// It uses only the Go toolchain, so the same command works in Docker, in each
// release job and on a developer machine without zip or tar installed.
package main

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const binaryName = "mengmeng-safehouse"

type target struct {
	goos, goarch, platform string
}

var targets = []target{
	{"windows", "amd64", "windows"},
	{"darwin", "arm64", "macos"},
	{"darwin", "amd64", "macos"},
	{"linux", "amd64", "linux"},
	{"linux", "arm64", "linux"},
}

// Fixed archive timestamps keep artifacts byte-identical across builders.
var archiveTime = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

func main() {
	out := flag.String("out", "", "directory to write artifacts into")
	version := flag.String("version", "dev", "version stamped into the binaries")
	module := flag.String("module", ".", "safehouse module directory")
	licenses := flag.String("licenses", "..", "directory holding LICENSE and NOTICE to ship in archives")
	flag.Parse()
	if *out == "" {
		fail("-out is required")
	}
	if err := os.MkdirAll(*out, 0o755); err != nil {
		fail(err.Error())
	}
	work, err := os.MkdirTemp("", "safehouse-pack-")
	if err != nil {
		fail(err.Error())
	}
	defer os.RemoveAll(work)

	extras := readLicenses(*licenses)
	for _, tgt := range targets {
		binary := filepath.Join(work, tgt.goos+"-"+tgt.goarch)
		if err := build(*module, binary, *version, tgt); err != nil {
			fail(fmt.Sprintf("build %s/%s: %v", tgt.goos, tgt.goarch, err))
		}
		content, err := os.ReadFile(binary)
		if err != nil {
			fail(err.Error())
		}
		base := filepath.Join(*out, binaryName+"-"+tgt.platform+"-"+tgt.goarch)
		var path string
		var data []byte
		switch tgt.goos {
		case "windows":
			path, data = base+".exe", content
		case "darwin":
			path = base + ".zip"
			data, err = zipArchive(content, extras)
		default:
			path = base + ".tar.gz"
			data, err = tarArchive(content, extras)
		}
		if err != nil {
			fail(err.Error())
		}
		if err = os.WriteFile(path, data, 0o644); err != nil {
			fail(err.Error())
		}
		fmt.Printf("%s (%d bytes)\n", filepath.Base(path), len(data))
	}
}

func build(module, output, version string, tgt target) error {
	ldflags := "-s -w -X main.version=" + version
	if tgt.goos == "windows" {
		ldflags += " -H=windowsgui"
	}
	command := exec.Command("go", "build", "-trimpath", "-buildvcs=false", "-ldflags", ldflags, "-o", output, ".")
	command.Dir = module
	// Later entries win, overriding any GOOS/GOARCH set for the host build.
	command.Env = append(os.Environ(), "CGO_ENABLED=0", "GOWORK=off", "GOFLAGS=-mod=readonly", "GOOS="+tgt.goos, "GOARCH="+tgt.goarch)
	command.Stdout = os.Stderr
	command.Stderr = os.Stderr
	return command.Run()
}

type extraFile struct {
	name    string
	content []byte
}

func readLicenses(dir string) []extraFile {
	var files []extraFile
	for _, name := range []string{"LICENSE", "NOTICE"} {
		content, err := os.ReadFile(filepath.Join(dir, name))
		if err == nil {
			files = append(files, extraFile{name: name, content: content})
		}
	}
	return files
}

// zipArchive supplies a Finder-launchable app and preserves its executable bit.
func zipArchive(binary []byte, extras []extraFile) ([]byte, error) {
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	add := func(name string, mode os.FileMode, content []byte) error {
		header := &zip.FileHeader{Name: name, Method: zip.Deflate, Modified: archiveTime}
		header.SetMode(mode)
		entry, err := writer.CreateHeader(header)
		if err != nil {
			return err
		}
		_, err = entry.Write(content)
		return err
	}
	const bundle = "Mengmeng Safe House.app/Contents/"
	const info = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.newapi.mengmeng-safehouse</string>
  <key>CFBundleName</key><string>Mengmeng Safe House</string>
  <key>CFBundleExecutable</key><string>mengmeng-safehouse</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
</dict></plist>`
	if err := add(bundle+"Info.plist", 0o644, []byte(info)); err != nil {
		return nil, err
	}
	if err := add(bundle+"MacOS/"+binaryName, 0o755, binary); err != nil {
		return nil, err
	}
	for _, extra := range extras {
		if err := add(extra.name, 0o644, extra.content); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func tarArchive(binary []byte, extras []extraFile) ([]byte, error) {
	var buffer bytes.Buffer
	compressed, err := gzip.NewWriterLevel(&buffer, gzip.BestCompression)
	if err != nil {
		return nil, err
	}
	compressed.ModTime = archiveTime
	writer := tar.NewWriter(compressed)
	add := func(name string, mode int64, content []byte) error {
		header := &tar.Header{Name: name, Mode: mode, Size: int64(len(content)), ModTime: archiveTime, Typeflag: tar.TypeReg, Format: tar.FormatPAX}
		if err := writer.WriteHeader(header); err != nil {
			return err
		}
		_, err := io.Copy(writer, bytes.NewReader(content))
		return err
	}
	if err = add(binaryName, 0o755, binary); err != nil {
		return nil, err
	}
	for _, extra := range extras {
		if err = add(extra.name, 0o644, extra.content); err != nil {
			return nil, err
		}
	}
	if err = writer.Close(); err != nil {
		return nil, err
	}
	if err = compressed.Close(); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func fail(message string) {
	fmt.Fprintln(os.Stderr, "pack: "+strings.TrimSpace(message))
	os.Exit(1)
}
