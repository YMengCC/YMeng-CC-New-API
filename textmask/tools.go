package textmask

import (
	"bytes"
	"encoding/json"
	"strings"
)

// Tool-aware protocol support: text lanes keep the same detector, while tool
// arguments and results are walked as JSON so a placeholder can never change
// structure. Unknown shapes still fail closed.

const (
	maxToolCount       = 256
	maxToolSchemaBytes = 1 << 20
	maxToolJSONDepth   = 32
	maxToolNameBytes   = 256
	maxOpaqueBytes     = 1 << 20
)

func hasSensitiveText(text string) bool {
	for _, span := range entityPattern.FindAllStringIndex(text, -1) {
		if validEntity(text, span[0], span[1]) {
			return true
		}
	}
	return false
}

func (s *Session) safeJSONKey(key string) bool {
	return !strings.Contains(key, s.marker) && !hasSensitiveText(key)
}

func (s *Session) maskJSONValue(raw []byte, depth int) ([]byte, error) {
	if depth > maxToolJSONDepth {
		return nil, ErrUnsupported
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, ErrUnsupported
	}
	switch trimmed[0] {
	case '"':
		text, err := stringValue(raw)
		if err != nil {
			return nil, err
		}
		text, err = s.maskText(text)
		if err != nil {
			return nil, err
		}
		return json.Marshal(text)
	case '{':
		value, err := decodeObject(raw)
		if err != nil {
			return nil, err
		}
		for key, item := range value {
			if !s.safeJSONKey(key) {
				return nil, ErrUnsupported
			}
			masked, err := s.maskJSONValue(item, depth+1)
			if err != nil {
				return nil, err
			}
			value[key] = masked
		}
		return json.Marshal(value)
	case '[':
		items, err := decodeArray(raw)
		if err != nil {
			return nil, err
		}
		for i, item := range items {
			masked, err := s.maskJSONValue(item, depth+1)
			if err != nil {
				return nil, err
			}
			items[i] = masked
		}
		return json.Marshal(items)
	default:
		if !json.Valid(trimmed) {
			return nil, ErrUnsupported
		}
		return append([]byte(nil), trimmed...), nil
	}
}

func (s *Session) restoreTextChecked(text string) (string, error) {
	restored := s.restoreText(text)
	if s.incomplete {
		return "", ErrIncomplete
	}
	return restored, nil
}

func (s *Session) restoreJSONValue(raw []byte, depth int) ([]byte, error) {
	if depth > maxToolJSONDepth {
		return nil, ErrUnsupported
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, ErrUnsupported
	}
	switch trimmed[0] {
	case '"':
		text, err := stringValue(raw)
		if err != nil {
			return nil, err
		}
		text, err = s.restoreTextChecked(text)
		if err != nil {
			return nil, err
		}
		return json.Marshal(text)
	case '{':
		value, err := decodeObject(raw)
		if err != nil {
			return nil, err
		}
		restored := make(object, len(value))
		for key, item := range value {
			restoredKey, err := s.restoreTextChecked(key)
			if err != nil {
				return nil, err
			}
			restoredItem, err := s.restoreJSONValue(item, depth+1)
			if err != nil {
				return nil, err
			}
			restored[restoredKey] = restoredItem
		}
		return json.Marshal(restored)
	case '[':
		items, err := decodeArray(raw)
		if err != nil {
			return nil, err
		}
		for i, item := range items {
			restored, err := s.restoreJSONValue(item, depth+1)
			if err != nil {
				return nil, err
			}
			items[i] = restored
		}
		return json.Marshal(items)
	default:
		if !json.Valid(trimmed) {
			return nil, ErrUnsupported
		}
		return append([]byte(nil), trimmed...), nil
	}
}

func (s *Session) maskJSONDocument(raw []byte) ([]byte, error) {
	return s.maskJSONValue(raw, 0)
}

func (s *Session) restoreJSONDocument(raw []byte) ([]byte, error) {
	return s.restoreJSONValue(raw, 0)
}

// maskJSONString masks the JSON document carried inside a JSON string, such as
// a Chat Completions function argument.
func (s *Session) maskJSONString(raw []byte) ([]byte, error) {
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return raw, nil
	}
	text, err := stringValue(raw)
	if err != nil {
		return nil, err
	}
	if text == "" {
		return raw, nil
	}
	masked, err := s.maskJSONDocument([]byte(text))
	if err != nil {
		return nil, err
	}
	return json.Marshal(string(masked))
}

func (s *Session) restoreJSONString(raw []byte) ([]byte, error) {
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return raw, nil
	}
	text, err := stringValue(raw)
	if err != nil {
		return nil, err
	}
	if text == "" {
		return raw, nil
	}
	restored, err := s.restoreJSONDocument([]byte(text))
	if err != nil {
		return nil, err
	}
	return json.Marshal(string(restored))
}

func (s *Session) maskJSONStringField(value object, field string) error {
	raw, ok := value[field]
	if !ok {
		return nil
	}
	masked, err := s.maskJSONString(raw)
	if err != nil {
		return err
	}
	value[field] = masked
	return nil
}

func (s *Session) restoreJSONStringField(value object, field string) error {
	raw, ok := value[field]
	if !ok {
		return nil
	}
	restored, err := s.restoreJSONString(raw)
	if err != nil {
		return err
	}
	value[field] = restored
	return nil
}

func (s *Session) maskOptionalString(value object, field string) error {
	raw, ok := value[field]
	if !ok || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil
	}
	text, err := stringValue(raw)
	if err != nil {
		return err
	}
	text, err = s.maskText(text)
	if err != nil {
		return err
	}
	return setJSON(value, field, text)
}

func (s *Session) toolName(value object, field string) (string, error) {
	text, err := stringValue(value[field])
	if err != nil || text == "" || len(text) > maxToolNameBytes || strings.Contains(text, s.marker) || hasSensitiveText(text) {
		return "", ErrUnsupported
	}
	return text, nil
}

func (s *Session) opaqueField(value object, field string, required bool) error {
	raw, ok := value[field]
	if !ok {
		if required {
			return ErrUnsupported
		}
		return nil
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		if required {
			return ErrUnsupported
		}
		return nil
	}
	text, err := stringValue(raw)
	if err != nil || len(text) > maxOpaqueBytes || strings.Contains(text, s.marker) {
		return ErrUnsupported
	}
	return nil
}

func (s *Session) validateToolSchema(raw []byte) error {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return nil
	}
	if len(raw) > maxToolSchemaBytes || !json.Valid(trimmed) || trimmed[0] != '{' {
		return ErrUnsupported
	}
	return s.scanToolSchema(trimmed, 0)
}

// scanToolSchema preserves the schema bytes (upstreams generate arguments in
// property order). Any schema string that contains a sensitive entity rejects
// the whole request; schema text is never rewritten.
func (s *Session) scanToolSchema(raw []byte, depth int) error {
	if depth > maxToolJSONDepth {
		return ErrUnsupported
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return ErrUnsupported
	}
	switch trimmed[0] {
	case '{':
		value, err := decodeObject(raw)
		if err != nil {
			return err
		}
		for key, item := range value {
			if !s.safeJSONKey(key) {
				return ErrUnsupported
			}
			if err = s.scanToolSchema(item, depth+1); err != nil {
				return err
			}
		}
		return nil
	case '[':
		items, err := decodeArray(raw)
		if err != nil {
			return err
		}
		for _, item := range items {
			if err = s.scanToolSchema(item, depth+1); err != nil {
				return err
			}
		}
		return nil
	case '"':
		text, err := stringValue(raw)
		if err != nil {
			return err
		}
		if hasSensitiveText(text) {
			return ErrUnsupported
		}
		return nil
	default:
		if !json.Valid(trimmed) {
			return ErrUnsupported
		}
		return nil
	}
}

func (s *Session) maskChatTools(raw []byte) ([]byte, error) {
	if optionalEmpty(raw) {
		return raw, nil
	}
	items, err := decodeArray(raw)
	if err != nil || len(items) > maxToolCount {
		return nil, ErrUnsupported
	}
	for i, item := range items {
		tool, err := decodeObject(item)
		if err != nil {
			return nil, err
		}
		if err = whitelist(tool, "type function"); err != nil {
			return nil, err
		}
		kind, err := stringValue(tool["type"])
		if err != nil || kind != "function" {
			return nil, ErrUnsupported
		}
		declaration, err := decodeObject(tool["function"])
		if err != nil {
			return nil, err
		}
		if err = whitelist(declaration, "name description parameters strict"); err != nil {
			return nil, err
		}
		if _, err = s.toolName(declaration, "name"); err != nil {
			return nil, err
		}
		if err = s.maskOptionalString(declaration, "description"); err != nil {
			return nil, err
		}
		if parameters, ok := declaration["parameters"]; ok {
			if err = s.validateToolSchema(parameters); err != nil {
				return nil, err
			}
		}
		if err = boolSettings(declaration, "strict"); err != nil {
			return nil, err
		}
		tool["function"], err = json.Marshal(declaration)
		if err != nil {
			return nil, ErrUnsupported
		}
		items[i], err = json.Marshal(tool)
		if err != nil {
			return nil, ErrUnsupported
		}
	}
	return json.Marshal(items)
}

func (s *Session) maskResponsesTools(raw []byte) ([]byte, error) {
	if optionalEmpty(raw) {
		return raw, nil
	}
	items, err := decodeArray(raw)
	if err != nil || len(items) > maxToolCount {
		return nil, ErrUnsupported
	}
	for i, item := range items {
		tool, err := decodeObject(item)
		if err != nil {
			return nil, err
		}
		if err = whitelist(tool, "type name description parameters strict"); err != nil {
			return nil, err
		}
		kind, err := stringValue(tool["type"])
		if err != nil || kind != "function" {
			return nil, ErrUnsupported
		}
		if _, err = s.toolName(tool, "name"); err != nil {
			return nil, err
		}
		if err = s.maskOptionalString(tool, "description"); err != nil {
			return nil, err
		}
		if parameters, ok := tool["parameters"]; ok {
			if err = s.validateToolSchema(parameters); err != nil {
				return nil, err
			}
		}
		if err = boolSettings(tool, "strict"); err != nil {
			return nil, err
		}
		items[i], err = json.Marshal(tool)
		if err != nil {
			return nil, ErrUnsupported
		}
	}
	return json.Marshal(items)
}

func (s *Session) maskClaudeTools(raw []byte) ([]byte, error) {
	if optionalEmpty(raw) {
		return raw, nil
	}
	items, err := decodeArray(raw)
	if err != nil || len(items) > maxToolCount {
		return nil, ErrUnsupported
	}
	for i, item := range items {
		tool, err := decodeObject(item)
		if err != nil {
			return nil, err
		}
		if err = whitelist(tool, "name description input_schema strict cache_control type"); err != nil {
			return nil, err
		}
		if kind, ok := tool["type"]; ok {
			text, e := stringValue(kind)
			if e != nil || (text != "" && text != "custom") {
				return nil, ErrUnsupported
			}
		}
		delete(tool, "cache_control")
		if _, err = s.toolName(tool, "name"); err != nil {
			return nil, err
		}
		if err = s.maskOptionalString(tool, "description"); err != nil {
			return nil, err
		}
		schema, ok := tool["input_schema"]
		if !ok {
			return nil, ErrUnsupported
		}
		if err = s.validateToolSchema(schema); err != nil {
			return nil, err
		}
		if err = boolSettings(tool, "strict"); err != nil {
			return nil, err
		}
		items[i], err = json.Marshal(tool)
		if err != nil {
			return nil, ErrUnsupported
		}
	}
	return json.Marshal(items)
}

func (s *Session) maskGeminiTools(raw []byte) ([]byte, error) {
	if optionalEmpty(raw) {
		return raw, nil
	}
	items, err := decodeArray(raw)
	if err != nil || len(items) > maxToolCount {
		return nil, ErrUnsupported
	}
	for i, item := range items {
		tool, err := decodeObject(item)
		if err != nil {
			return nil, err
		}
		if err = whitelist(tool, "functionDeclarations"); err != nil {
			return nil, err
		}
		declarations, err := decodeArray(tool["functionDeclarations"])
		if err != nil || len(declarations) == 0 || len(declarations) > maxToolCount {
			return nil, ErrUnsupported
		}
		for j, declarationRaw := range declarations {
			declaration, err := decodeObject(declarationRaw)
			if err != nil {
				return nil, err
			}
			if err = whitelist(declaration, "name description parameters response"); err != nil {
				return nil, err
			}
			if _, err = s.toolName(declaration, "name"); err != nil {
				return nil, err
			}
			if err = s.maskOptionalString(declaration, "description"); err != nil {
				return nil, err
			}
			for _, field := range []string{"parameters", "response"} {
				if schema, ok := declaration[field]; ok {
					if err = s.validateToolSchema(schema); err != nil {
						return nil, err
					}
				}
			}
			declarations[j], err = json.Marshal(declaration)
			if err != nil {
				return nil, ErrUnsupported
			}
		}
		tool["functionDeclarations"], err = json.Marshal(declarations)
		if err != nil {
			return nil, ErrUnsupported
		}
		items[i], err = json.Marshal(tool)
		if err != nil {
			return nil, ErrUnsupported
		}
	}
	return json.Marshal(items)
}

func (s *Session) maskChatToolChoice(raw []byte) ([]byte, error) {
	if optionalEmpty(raw) {
		return raw, nil
	}
	if bytes.TrimSpace(raw)[0] == '"' {
		text, err := stringValue(raw)
		if err != nil || !strings.Contains(" none auto required ", " "+text+" ") {
			return nil, ErrUnsupported
		}
		return raw, nil
	}
	value, err := decodeObject(raw)
	if err != nil {
		return nil, err
	}
	if err = whitelist(value, "type function"); err != nil {
		return nil, err
	}
	kind, err := stringValue(value["type"])
	if err != nil || kind != "function" {
		return nil, ErrUnsupported
	}
	declaration, err := decodeObject(value["function"])
	if err != nil {
		return nil, err
	}
	if err = whitelist(declaration, "name"); err != nil {
		return nil, err
	}
	if _, err = s.toolName(declaration, "name"); err != nil {
		return nil, err
	}
	value["function"], err = json.Marshal(declaration)
	if err != nil {
		return nil, ErrUnsupported
	}
	return json.Marshal(value)
}

func (s *Session) maskResponsesToolChoice(raw []byte) ([]byte, error) {
	if optionalEmpty(raw) {
		return raw, nil
	}
	if bytes.TrimSpace(raw)[0] == '"' {
		text, err := stringValue(raw)
		if err != nil || !strings.Contains(" none auto required ", " "+text+" ") {
			return nil, ErrUnsupported
		}
		return raw, nil
	}
	value, err := decodeObject(raw)
	if err != nil {
		return nil, err
	}
	if err = whitelist(value, "type name"); err != nil {
		return nil, err
	}
	kind, err := stringValue(value["type"])
	if err != nil || kind != "function" {
		return nil, ErrUnsupported
	}
	if _, err = s.toolName(value, "name"); err != nil {
		return nil, err
	}
	return json.Marshal(value)
}

func (s *Session) maskClaudeToolChoice(raw []byte) ([]byte, error) {
	if optionalEmpty(raw) {
		return raw, nil
	}
	value, err := decodeObject(raw)
	if err != nil {
		return nil, err
	}
	if err = whitelist(value, "type name disable_parallel_tool_use"); err != nil {
		return nil, err
	}
	kind, err := stringValue(value["type"])
	if err != nil || !strings.Contains(" auto any tool none ", " "+kind+" ") {
		return nil, ErrUnsupported
	}
	if kind == "tool" {
		if _, err = s.toolName(value, "name"); err != nil {
			return nil, err
		}
	} else if _, ok := value["name"]; ok {
		return nil, ErrUnsupported
	}
	if err = boolSettings(value, "disable_parallel_tool_use"); err != nil {
		return nil, err
	}
	return json.Marshal(value)
}

func (s *Session) maskGeminiToolConfig(raw []byte) ([]byte, error) {
	if optionalEmpty(raw) {
		return raw, nil
	}
	value, err := decodeObject(raw)
	if err != nil {
		return nil, err
	}
	if err = whitelist(value, "functionCallingConfig"); err != nil {
		return nil, err
	}
	config, err := decodeObject(value["functionCallingConfig"])
	if err != nil {
		return nil, err
	}
	if err = whitelist(config, "mode allowedFunctionNames"); err != nil {
		return nil, err
	}
	if err = enumSetting(config, "mode", "MODE_UNSPECIFIED AUTO ANY NONE VALIDATED"); err != nil {
		return nil, err
	}
	if rawNames, ok := config["allowedFunctionNames"]; ok {
		names, err := decodeArray(rawNames)
		if err != nil || len(names) > maxToolCount {
			return nil, ErrUnsupported
		}
		for i, nameRaw := range names {
			name, err := stringValue(nameRaw)
			if err != nil || name == "" || len(name) > maxToolNameBytes || strings.Contains(name, s.marker) || hasSensitiveText(name) {
				return nil, ErrUnsupported
			}
			names[i], _ = json.Marshal(name)
		}
		config["allowedFunctionNames"], _ = json.Marshal(names)
	}
	value["functionCallingConfig"], _ = json.Marshal(config)
	return json.Marshal(value)
}
