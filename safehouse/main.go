// Command mengmeng-safehouse runs 萌萌的安全小屋 (Mengmeng's Safe House): a
// local proxy that masks sensitive text before requests leave this computer
// and restores it in replies, so the site never receives the original.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"sync"
	"syscall"
	"time"

	"github.com/QuantumNous/new-api/safehouse/internal/local"
)

var version = "dev"

const maxLogBytes = 1 << 20

func main() {
	port := flag.Int("port", 17860, "local port to listen on")
	background := flag.Bool("background", false, "start without opening the control panel")
	showVersion := flag.Bool("version", false, "print the version and exit")
	flag.Parse()
	if *showVersion {
		fmt.Println(version)
		return
	}

	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	panelURL := "http://" + addr + "/"
	dir, err := local.ConfigDir()
	if err != nil {
		notifyError("萌萌的安全小屋无法找到配置目录。\nMengmeng's Safe House cannot find its config folder.")
		os.Exit(1)
	}
	logger := openLogger(dir)

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		if alreadyRunning(addr) {
			if !*background {
				openBrowser(panelURL)
			}
			return
		}
		logger.Printf("listen failed: %v", err)
		notifyError(fmt.Sprintf("萌萌的安全小屋无法使用端口 %d，可能被其他程序占用。\nMengmeng's Safe House cannot use port %d. Another program may be using it.", *port, *port))
		os.Exit(1)
	}

	done := make(chan struct{})
	var quitOnce sync.Once
	requestQuit := func() { quitOnce.Do(func() { close(done) }) }

	server, err := local.NewServer(local.Options{
		Addr:       addr,
		ConfigPath: filepath.Join(dir, "config.json"),
		Version:    version,
		Autostart:  local.NewAutostart(),
		Quit:       requestQuit,
		Logger:     logger,
	})
	if err != nil {
		logger.Printf("start failed: %v", err)
		os.Exit(1)
	}
	httpServer := &http.Server{
		Handler:           server.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ErrorLog:          logger,
	}
	go func() {
		if err := httpServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Printf("serve failed: %v", err)
			requestQuit()
		}
	}()
	logger.Printf("started %s on %s", version, addr)

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	go func() {
		select {
		case <-signals:
			requestQuit()
		case <-done:
		}
	}()

	if !*background {
		openBrowser(panelURL)
	}
	runUntilQuit(panelURL, done, requestQuit)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
	logger.Printf("stopped")
}

// alreadyRunning tells a second launch apart from a foreign program holding
// the port, so double-clicking again simply reopens the panel.
func alreadyRunning(addr string) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Get("http://" + addr + "/api/ping")
	if err != nil {
		return false
	}
	defer response.Body.Close()
	var ping struct {
		App string `json:"app"`
	}
	if json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&ping) != nil {
		return false
	}
	return ping.App == "mengmeng-safehouse"
}

// openLogger writes operational events only; request bodies, headers and
// query strings are never logged.
func openLogger(dir string) *log.Logger {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return log.New(io.Discard, "", 0)
	}
	path := filepath.Join(dir, "safehouse.log")
	if info, err := os.Stat(path); err == nil && info.Size() > maxLogBytes {
		_ = os.Remove(path)
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return log.New(io.Discard, "", 0)
	}
	return log.New(file, "", log.LstdFlags)
}

func openBrowser(url string) {
	var command *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		command = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		command = exec.Command("open", url)
	default:
		command = exec.Command("xdg-open", url)
	}
	if command.Start() == nil {
		go func() { _ = command.Wait() }()
	}
}
