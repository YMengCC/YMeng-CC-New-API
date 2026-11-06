package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"image/png"
	"io"
	"mime/multipart"
)

const (
	MaxPayoutQRSize      int64 = 5 * 1024 * 1024
	MaxPayoutQRDimension       = 4096
)

type UploadedPayoutQR struct {
	Data   []byte
	Width  int
	Height int
	Sha256 string
}

// ReadPayoutQRUpload accepts only a complete, bounded PNG and preserves the
// exact bytes the client uploads (the console may crop before upload) so the
// server never re-encodes payment information.
func ReadPayoutQRUpload(header *multipart.FileHeader) (*UploadedPayoutQR, error) {
	invalid := errors.New("Invalid payout QR image")
	if header == nil || header.Size <= 0 || header.Size > MaxPayoutQRSize {
		return nil, invalid
	}
	file, err := header.Open()
	if err != nil {
		return nil, invalid
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, MaxPayoutQRSize+1))
	if err != nil || len(data) < 8 || int64(len(data)) > MaxPayoutQRSize || !bytes.Equal(data[:8], []byte("\x89PNG\r\n\x1a\n")) {
		return nil, invalid
	}
	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width < 1 || config.Height < 1 || config.Width > MaxPayoutQRDimension || config.Height > MaxPayoutQRDimension {
		return nil, invalid
	}
	if _, err := png.Decode(bytes.NewReader(data)); err != nil {
		return nil, invalid
	}
	sum := sha256.Sum256(data)
	return &UploadedPayoutQR{Data: data, Width: config.Width, Height: config.Height, Sha256: hex.EncodeToString(sum[:])}, nil
}
