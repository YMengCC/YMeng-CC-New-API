package textmask

import (
	"bytes"
	"slices"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type object map[string]common.RawMessage

func decodeObject(raw []byte) (object, error) {
	var value object
	if len(bytes.TrimSpace(raw)) == 0 || bytes.TrimSpace(raw)[0] != '{' || common.Unmarshal(raw, &value) != nil || value == nil {
		return nil, ErrUnsupported
	}
	return value, nil
}

func decodeArray(raw []byte) ([]common.RawMessage, error) {
	var value []common.RawMessage
	if len(bytes.TrimSpace(raw)) == 0 || bytes.TrimSpace(raw)[0] != '[' || common.Unmarshal(raw, &value) != nil {
		return nil, ErrUnsupported
	}
	return value, nil
}

func stringValue(raw []byte) (string, error) {
	var value string
	if len(bytes.TrimSpace(raw)) == 0 || bytes.TrimSpace(raw)[0] != '"' || common.Unmarshal(raw, &value) != nil {
		return "", ErrUnsupported
	}
	return value, nil
}

func optionalEmpty(raw []byte) bool {
	raw = bytes.TrimSpace(raw)
	return len(raw) == 0 || bytes.Equal(raw, []byte("null")) || bytes.Equal(raw, []byte("\"\"")) || bytes.Equal(raw, []byte("[]")) || bytes.Equal(raw, []byte("{}"))
}

// whitelist removes only empty unknown extensions; populated extensions fail closed.
func whitelist(value object, fields string) error {
	allowed := strings.Fields(fields)
	for key, raw := range value {
		if !slices.Contains(allowed, key) {
			if !optionalEmpty(raw) {
				return ErrUnsupported
			}
			delete(value, key)
		}
	}
	return nil
}

func setJSON(value object, key string, data any) error {
	raw, err := common.Marshal(data)
	if err != nil {
		return ErrUnsupported
	}
	value[key] = raw
	return nil
}

func (s *Session) maskString(value object, key string, required bool) error {
	raw, exists := value[key]
	if !exists {
		if required {
			return ErrUnsupported
		}
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
	return setJSON(value, key, text)
}

func (s *Session) maskStrings(raw []byte) ([]byte, error) {
	if len(bytes.TrimSpace(raw)) > 0 && bytes.TrimSpace(raw)[0] == '"' {
		text, err := stringValue(raw)
		if err != nil {
			return nil, err
		}
		text, err = s.maskText(text)
		if err != nil {
			return nil, err
		}
		return common.Marshal(text)
	}
	items, err := decodeArray(raw)
	if err != nil {
		return nil, err
	}
	for i, item := range items {
		text, err := stringValue(item)
		if err != nil {
			return nil, err
		}
		text, err = s.maskText(text)
		if err != nil {
			return nil, err
		}
		items[i], err = common.Marshal(text)
		if err != nil {
			return nil, ErrUnsupported
		}
	}
	return common.Marshal(items)
}

func numericSettings(value object, fields string) error {
	for field := range strings.FieldsSeq(fields) {
		raw, exists := value[field]
		if !exists {
			continue
		}
		if _, err := strconv.ParseFloat(string(raw), 64); err != nil {
			return ErrUnsupported
		}
	}
	return nil
}

func boolSettings(value object, fields string) error {
	for field := range strings.FieldsSeq(fields) {
		raw, exists := value[field]
		if !exists {
			continue
		}
		if string(raw) != "true" && string(raw) != "false" {
			return ErrUnsupported
		}
	}
	return nil
}

func enumSetting(value object, field, allowed string) error {
	raw, exists := value[field]
	if !exists {
		return nil
	}
	text, err := stringValue(raw)
	if err != nil || !slices.Contains(strings.Fields(allowed), text) {
		return ErrUnsupported
	}
	return nil
}

func (s *Session) maskParts(raw []byte, protocol string) ([]byte, error) {
	if len(bytes.TrimSpace(raw)) > 0 && bytes.TrimSpace(raw)[0] == '"' {
		return s.maskStrings(raw)
	}
	parts, err := decodeArray(raw)
	if err != nil {
		return nil, err
	}
	for i, part := range parts {
		value, err := decodeObject(part)
		if err != nil {
			return nil, err
		}
		switch protocol {
		case "gemini":
			if err = whitelist(value, "text"); err != nil {
				return nil, err
			}
		default:
			if err = whitelist(value, "type text"); err != nil {
				return nil, err
			}
			kind, err := stringValue(value["type"])
			if err != nil || (kind != "text" && !(protocol == "responses" && (kind == "input_text" || kind == "output_text"))) {
				return nil, ErrUnsupported
			}
		}
		if err = s.maskString(value, "text", true); err != nil {
			return nil, err
		}
		parts[i], err = common.Marshal(value)
		if err != nil {
			return nil, ErrUnsupported
		}
	}
	return common.Marshal(parts)
}

func (s *Session) maskMessages(raw []byte, protocol string) ([]byte, error) {
	messages, err := decodeArray(raw)
	if err != nil || len(messages) == 0 {
		return nil, ErrUnsupported
	}
	for i, message := range messages {
		value, err := decodeObject(message)
		if err != nil {
			return nil, err
		}
		fields := "role content"
		if protocol == "responses" {
			fields += " type"
		}
		if protocol == "gemini" {
			fields = "role parts"
		}
		if err = whitelist(value, fields); err != nil {
			return nil, err
		}
		if protocol == "responses" {
			if err = enumSetting(value, "type", "message"); err != nil {
				return nil, err
			}
		}
		role := ""
		if rawRole, exists := value["role"]; exists {
			role, err = stringValue(rawRole)
			if err != nil {
				return nil, ErrUnsupported
			}
		} else if protocol != "gemini" {
			return nil, ErrUnsupported
		}
		allowed := "system developer user assistant"
		if protocol == "claude" {
			allowed = "user assistant"
		}
		if protocol == "gemini" {
			allowed = "user model"
		}
		if role != "" && !slices.Contains(strings.Fields(allowed), role) {
			return nil, ErrUnsupported
		}
		field := "content"
		if protocol == "gemini" {
			field = "parts"
		}
		value[field], err = s.maskParts(value[field], protocol)
		if err != nil {
			return nil, err
		}
		messages[i], err = common.Marshal(value)
		if err != nil {
			return nil, ErrUnsupported
		}
	}
	return common.Marshal(messages)
}

// MaskJSON validates and masks a single text-only request. Tools, media,
// encrypted/signed history and server-side conversation references are unsupported.
// Responses always opts out of storage; an explicit store:true is rejected.
// Numeric generation parameters remain byte-for-byte raw values for host validation.
func (s *Session) MaskJSON(body []byte, protocol string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil, ErrClosed
	}
	value, err := decodeObject(body)
	if err != nil {
		return nil, err
	}
	switch protocol {
	case "chat", "completions", "playground":
		fields := "model stream stream_options max_tokens max_completion_tokens min_tokens temperature top_p top_k n frequency_penalty presence_penalty seed logprobs top_logprobs stop reasoning_effort verbosity response_format store"
		if protocol != "completions" {
			fields += " messages"
		} else {
			fields += " prompt suffix echo best_of logit_bias"
		}
		if protocol == "playground" {
			fields += " group"
			if group, exists := value["group"]; exists {
				if _, err = stringValue(group); err != nil {
					return nil, err
				}
			}
		}
		if err = whitelist(value, fields); err != nil {
			return nil, err
		}
		if err = numericSettings(value, "max_tokens max_completion_tokens min_tokens temperature top_p top_k n frequency_penalty presence_penalty seed top_logprobs best_of"); err != nil {
			return nil, err
		}
		if err = boolSettings(value, "stream echo store"); err != nil {
			return nil, err
		}
		if protocol != "completions" {
			if err = boolSettings(value, "logprobs"); err != nil {
				return nil, err
			}
		} else if err = numericSettings(value, "logprobs"); err != nil {
			return nil, err
		}
		if string(value["store"]) == "true" {
			return nil, ErrUnsupported
		}
		if protocol != "completions" {
			value["messages"], err = s.maskMessages(value["messages"], protocol)
		} else {
			value["prompt"], err = s.maskStrings(value["prompt"])
			if err == nil {
				err = s.maskString(value, "suffix", false)
			}
		}
		if err != nil {
			return nil, err
		}
		if err = enumSetting(value, "reasoning_effort", "none minimal low medium high xhigh"); err != nil {
			return nil, err
		}
		if err = enumSetting(value, "verbosity", "low medium high"); err != nil {
			return nil, err
		}
		if raw, ok := value["response_format"]; ok {
			format, e := decodeObject(raw)
			if e != nil || whitelist(format, "type") != nil || enumSetting(format, "type", "text json_object") != nil {
				return nil, ErrUnsupported
			}
			value["response_format"], _ = common.Marshal(format)
		}
		// Arbitrary bias keys are token IDs, but values must be numeric.
		if raw, ok := value["logit_bias"]; ok {
			bias, e := decodeObject(raw)
			if e != nil {
				return nil, e
			}
			for key, v := range bias {
				if _, e = strconv.ParseUint(key, 10, 64); e != nil {
					return nil, ErrUnsupported
				}
				if _, e = strconv.ParseFloat(string(v), 64); e != nil {
					return nil, ErrUnsupported
				}
			}
		}
	case "responses":
		if err = whitelist(value, "model input instructions stream stream_options max_output_tokens top_logprobs temperature top_p frequency_penalty presence_penalty store background reasoning text truncation service_tier"); err != nil {
			return nil, err
		}
		if err = boolSettings(value, "stream store background"); err != nil {
			return nil, err
		}
		if string(value["store"]) == "true" || string(value["background"]) == "true" {
			return nil, ErrUnsupported
		}
		value["store"] = common.RawMessage("false")
		if err = numericSettings(value, "max_output_tokens top_logprobs temperature top_p frequency_penalty presence_penalty"); err != nil {
			return nil, err
		}
		raw := value["input"]
		if len(bytes.TrimSpace(raw)) > 0 && bytes.TrimSpace(raw)[0] == '"' {
			value["input"], err = s.maskStrings(raw)
		} else {
			value["input"], err = s.maskMessages(raw, protocol)
		}
		if err != nil {
			return nil, err
		}
		if err = s.maskString(value, "instructions", false); err != nil {
			return nil, err
		}
		if raw, ok := value["reasoning"]; ok {
			settings, e := decodeObject(raw)
			if e != nil || whitelist(settings, "effort summary") != nil || enumSetting(settings, "effort", "none minimal low medium high xhigh") != nil || enumSetting(settings, "summary", "auto concise detailed") != nil {
				return nil, ErrUnsupported
			}
			value["reasoning"], _ = common.Marshal(settings)
		}
		if raw, ok := value["text"]; ok {
			settings, e := decodeObject(raw)
			if e != nil || whitelist(settings, "format verbosity") != nil || enumSetting(settings, "verbosity", "low medium high") != nil {
				return nil, ErrUnsupported
			}
			if format, exists := settings["format"]; exists {
				f, e := decodeObject(format)
				if e != nil || whitelist(f, "type") != nil || enumSetting(f, "type", "text json_object") != nil {
					return nil, ErrUnsupported
				}
				settings["format"], _ = common.Marshal(f)
			}
			value["text"], _ = common.Marshal(settings)
		}
		if enumSetting(value, "truncation", "auto disabled") != nil || enumSetting(value, "service_tier", "auto default flex priority") != nil {
			return nil, ErrUnsupported
		}
	case "claude":
		if err = whitelist(value, "model system messages max_tokens max_tokens_to_sample temperature top_p top_k stream stop_sequences thinking service_tier"); err != nil {
			return nil, err
		}
		if err = numericSettings(value, "max_tokens max_tokens_to_sample temperature top_p top_k"); err != nil {
			return nil, err
		}
		if err = boolSettings(value, "stream"); err != nil {
			return nil, err
		}
		value["messages"], err = s.maskMessages(value["messages"], protocol)
		if err != nil {
			return nil, err
		}
		if raw, ok := value["system"]; ok {
			value["system"], err = s.maskParts(raw, protocol)
			if err != nil {
				return nil, err
			}
		}
		if raw, ok := value["thinking"]; ok {
			settings, e := decodeObject(raw)
			if e != nil || whitelist(settings, "type budget_tokens display") != nil || enumSetting(settings, "type", "enabled disabled adaptive") != nil || enumSetting(settings, "display", "summarized omitted") != nil || numericSettings(settings, "budget_tokens") != nil {
				return nil, ErrUnsupported
			}
			value["thinking"], _ = common.Marshal(settings)
		}
		if enumSetting(value, "service_tier", "auto standard_only") != nil {
			return nil, ErrUnsupported
		}
	case "gemini":
		if err = whitelist(value, "model contents systemInstruction system_instruction generationConfig safetySettings"); err != nil {
			return nil, err
		}
		value["contents"], err = s.maskMessages(value["contents"], protocol)
		if err != nil {
			return nil, err
		}
		for _, field := range []string{"systemInstruction", "system_instruction"} {
			if raw, ok := value[field]; ok {
				item, e := decodeObject(raw)
				if e != nil || whitelist(item, "role parts") != nil || enumSetting(item, "role", "system user") != nil {
					return nil, ErrUnsupported
				}
				item["parts"], err = s.maskParts(item["parts"], protocol)
				if err != nil {
					return nil, err
				}
				value[field], _ = common.Marshal(item)
			}
		}
		if raw, ok := value["generationConfig"]; ok {
			settings, e := decodeObject(raw)
			if e != nil || whitelist(settings, "temperature topP topK maxOutputTokens candidateCount stopSequences responseMimeType presencePenalty frequencyPenalty responseLogprobs logprobs seed thinkingConfig") != nil || numericSettings(settings, "temperature topP topK maxOutputTokens candidateCount presencePenalty frequencyPenalty logprobs seed") != nil || boolSettings(settings, "responseLogprobs") != nil || enumSetting(settings, "responseMimeType", "text/plain application/json") != nil {
				return nil, ErrUnsupported
			}
			if stop, ok := settings["stopSequences"]; ok {
				settings["stopSequences"], err = s.maskStrings(stop)
				if err != nil {
					return nil, err
				}
			}
			if thinking, ok := settings["thinkingConfig"]; ok {
				t, e := decodeObject(thinking)
				if e != nil || whitelist(t, "includeThoughts thinkingBudget thinkingLevel") != nil || boolSettings(t, "includeThoughts") != nil || numericSettings(t, "thinkingBudget") != nil || enumSetting(t, "thinkingLevel", "minimal low medium high") != nil {
					return nil, ErrUnsupported
				}
				settings["thinkingConfig"], _ = common.Marshal(t)
			}
			value["generationConfig"], _ = common.Marshal(settings)
		}
		if raw, ok := value["safetySettings"]; ok {
			settings, e := decodeArray(raw)
			if e != nil {
				return nil, e
			}
			for i, item := range settings {
				setting, e := decodeObject(item)
				if e != nil || whitelist(setting, "category threshold") != nil || enumSetting(setting, "category", "HARM_CATEGORY_HARASSMENT HARM_CATEGORY_HATE_SPEECH HARM_CATEGORY_SEXUALLY_EXPLICIT HARM_CATEGORY_DANGEROUS_CONTENT HARM_CATEGORY_CIVIC_INTEGRITY") != nil || enumSetting(setting, "threshold", "BLOCK_NONE BLOCK_ONLY_HIGH BLOCK_MEDIUM_AND_ABOVE BLOCK_LOW_AND_ABOVE OFF HARM_BLOCK_THRESHOLD_UNSPECIFIED") != nil {
					return nil, ErrUnsupported
				}
				settings[i], _ = common.Marshal(setting)
			}
			value["safetySettings"], _ = common.Marshal(settings)
		}
	default:
		return nil, ErrUnsupported
	}
	if raw, ok := value["model"]; ok {
		model, e := stringValue(raw)
		if e != nil || model == "" || strings.Contains(model, tokenMarker) {
			return nil, ErrUnsupported
		}
	} else if protocol != "gemini" {
		return nil, ErrUnsupported
	}
	for _, field := range []string{"stop", "stop_sequences"} {
		if raw, ok := value[field]; ok {
			value[field], err = s.maskStrings(raw)
			if err != nil {
				return nil, err
			}
		}
	}
	if raw, ok := value["stream_options"]; ok {
		settings, e := decodeObject(raw)
		if e != nil || whitelist(settings, "include_usage include_obfuscation") != nil || boolSettings(settings, "include_usage include_obfuscation") != nil {
			return nil, ErrUnsupported
		}
		value["stream_options"], _ = common.Marshal(settings)
	}
	result, err := common.Marshal(value)
	if err != nil {
		return nil, ErrUnsupported
	}
	return result, nil
}
