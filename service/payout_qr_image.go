package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"

	_ "golang.org/x/image/webp"
)

const (
	MaxPayoutQRSize      int64 = 5 * 1024 * 1024
	MaxPayoutQRDimension       = 4096
)

var payoutFormatByContentType = map[string]string{
	"image/jpeg": "jpeg",
	"image/png":  "png",
	"image/webp": "webp",
}

type UploadedPayoutQR struct {
	MimeType string
	Data     []byte
	Width    int
	Height   int
	Sha256   string
}

// ReadPayoutQRUpload validates a collection QR or payment proof from its bytes.
// The filename and part content type are ignored: only a complete, bounded
// JPEG/PNG/WebP raster is accepted and preserved exactly as uploaded.
func ReadPayoutQRUpload(header *multipart.FileHeader) (*UploadedPayoutQR, error) {
	invalid := errors.New("Invalid payout image")
	if header == nil || header.Size <= 0 || header.Size > MaxPayoutQRSize {
		return nil, invalid
	}
	file, err := header.Open()
	if err != nil {
		return nil, invalid
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, MaxPayoutQRSize+1))
	if err != nil || len(data) == 0 || int64(len(data)) > MaxPayoutQRSize {
		return nil, invalid
	}
	contentType := http.DetectContentType(data)
	expectedFormat, ok := payoutFormatByContentType[contentType]
	if !ok {
		return nil, invalid
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || format != expectedFormat {
		return nil, invalid
	}
	if config.Width <= 0 || config.Height <= 0 || config.Width > MaxPayoutQRDimension || config.Height > MaxPayoutQRDimension {
		return nil, invalid
	}
	if _, decodedFormat, err := image.Decode(bytes.NewReader(data)); err != nil || decodedFormat != expectedFormat {
		return nil, invalid
	}
	sum := sha256.Sum256(data)
	return &UploadedPayoutQR{
		MimeType: contentType, Data: data,
		Width: config.Width, Height: config.Height,
		Sha256: hex.EncodeToString(sum[:]),
	}, nil
}

// PayoutImageContentType returns a safe Content-Type for previously validated
// payout bytes. The upload validator preserve bytes exactly, so sniffing is
// deterministic and legacy PNG records remain compatible.
func PayoutImageContentType(data []byte) string {
	contentType := http.DetectContentType(data)
	if _, ok := payoutFormatByContentType[contentType]; ok {
		return contentType
	}
	return "application/octet-stream"
}
