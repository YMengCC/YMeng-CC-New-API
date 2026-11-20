package controller

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"io/fs"
	"net/http"
	"regexp"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/safehousebundle"
	"github.com/gin-gonic/gin"
)

// safehouseArtifactName is the full set of files the console may offer; any
// other embedded file, including the placeholder, is ignored.
var safehouseArtifactName = regexp.MustCompile(`^mengmeng-safehouse-(windows|macos|linux)-(amd64|arm64)\.(exe|zip|tar\.gz)$`)

type safehouseArtifact struct {
	Platform string `json:"platform"`
	Arch     string `json:"arch"`
	FileName string `json:"file_name"`
	Size     int64  `json:"size"`
	SHA256   string `json:"sha256"`
}

type safehouseDownloadList struct {
	Version string              `json:"version"`
	Items   []safehouseArtifact `json:"items"`
}

// safehouseDownloads lists the local program builds embedded in the gateway.
// Hashes are computed once, on first use.
type safehouseDownloads struct {
	files  fs.FS
	once   sync.Once
	items  []safehouseArtifact
	byName map[string]bool
}

func newSafehouseDownloads(files fs.FS) *safehouseDownloads {
	return &safehouseDownloads{files: files}
}

var embeddedSafehouseDownloads = newSafehouseDownloads(safehousebundle.Files())

func (d *safehouseDownloads) load() {
	d.once.Do(func() {
		d.items = []safehouseArtifact{}
		d.byName = map[string]bool{}
		// fs.ReadDir returns entries sorted by name, so the list is stable.
		entries, err := fs.ReadDir(d.files, ".")
		if err != nil {
			return
		}
		for _, entry := range entries {
			match := safehouseArtifactName.FindStringSubmatch(entry.Name())
			if entry.IsDir() || match == nil {
				continue
			}
			file, err := d.files.Open(entry.Name())
			if err != nil {
				continue
			}
			hash := sha256.New()
			size, err := io.Copy(hash, file)
			_ = file.Close()
			if err != nil || size == 0 {
				continue
			}
			d.items = append(d.items, safehouseArtifact{
				Platform: match[1],
				Arch:     match[2],
				FileName: entry.Name(),
				Size:     size,
				SHA256:   hex.EncodeToString(hash.Sum(nil)),
			})
			d.byName[entry.Name()] = true
		}
	})
}

func (d *safehouseDownloads) list(c *gin.Context) {
	d.load()
	common.ApiSuccess(c, safehouseDownloadList{Version: common.Version, Items: d.items})
}

func (d *safehouseDownloads) download(c *gin.Context) {
	d.load()
	name := c.Param("name")
	// Exact lookup against the validated list; the name never builds a path.
	if !d.byName[name] {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	file, err := d.files.Open(name)
	if err != nil {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	defer file.Close()
	content, ok := file.(io.ReadSeeker)
	if !ok {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	header := c.Writer.Header()
	header.Set("Content-Type", "application/octet-stream")
	header.Set("Content-Disposition", `attachment; filename="`+name+`"`)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Cache-Control", "private, no-cache")
	http.ServeContent(c.Writer, c.Request, name, time.Time{}, content)
}

// GetSafehouseDownloads lists the 萌萌的安全小屋 builds included in this gateway.
func GetSafehouseDownloads(c *gin.Context) { embeddedSafehouseDownloads.list(c) }

// DownloadSafehouseArtifact serves one embedded 萌萌的安全小屋 build.
func DownloadSafehouseArtifact(c *gin.Context) { embeddedSafehouseDownloads.download(c) }
