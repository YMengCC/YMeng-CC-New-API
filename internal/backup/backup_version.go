package backup

import (
	"strconv"
	"strings"
)

func isOlderApplicationVersion(target, source string) bool {
	targetParts, targetOK := numericVersionParts(target)
	sourceParts, sourceOK := numericVersionParts(source)
	if !targetOK || !sourceOK {
		return false
	}
	for len(targetParts) < len(sourceParts) {
		targetParts = append(targetParts, 0)
	}
	for len(sourceParts) < len(targetParts) {
		sourceParts = append(sourceParts, 0)
	}
	for i := range targetParts {
		if targetParts[i] == sourceParts[i] {
			continue
		}
		return targetParts[i] < sourceParts[i]
	}
	return false
}

func numericVersionParts(version string) ([]int, bool) {
	version = strings.TrimPrefix(strings.TrimSpace(version), "v")
	parts := strings.Split(version, ".")
	if len(parts) == 0 {
		return nil, false
	}
	result := make([]int, len(parts))
	for i, part := range parts {
		value, err := strconv.Atoi(part)
		if err != nil || value < 0 {
			return nil, false
		}
		result[i] = value
	}
	return result, true
}
