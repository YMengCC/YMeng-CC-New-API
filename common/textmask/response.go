package textmask

import (
	"bytes"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

func streamIndex(value object, field string, fallback int) (string, error) {
	raw, ok := value[field]
	if !ok {
		return strconv.Itoa(fallback), nil
	}
	index, err := strconv.ParseUint(string(raw), 10, 32)
	if err != nil {
		return "", ErrUnsupported
	}
	return strconv.FormatUint(index, 10), nil
}

func (s *Session) restoreField(value object, field, key string, stream, final bool) error {
	raw, ok := value[field]
	if !ok {
		return nil
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil
	}
	text, err := stringValue(raw)
	if err != nil {
		return err
	}
	if stream {
		text = s.restoreDelta(key, text, final)
	} else {
		text = s.restoreText(text)
		if strings.Contains(text, s.prefix) {
			return ErrIncomplete
		}
	}
	return setJSON(value, field, text)
}

// restoreContent deliberately avoids recursive replacement of arbitrary strings:
// IDs, metadata, usage, citations and signatures are never text lanes.
func (s *Session) restoreContent(value object, field, key string, stream, final bool) error {
	raw, ok := value[field]
	if !ok || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil
	}
	if len(bytes.TrimSpace(raw)) > 0 && bytes.TrimSpace(raw)[0] == '"' {
		return s.restoreField(value, field, key, stream, final)
	}
	parts, err := decodeArray(raw)
	if err != nil {
		return err
	}
	for i, item := range parts {
		part, err := decodeObject(item)
		if err != nil {
			return err
		}
		kind, _ := stringValue(part["type"])
		lane := key + "/" + strconv.Itoa(i)
		switch kind {
		case "text", "output_text", "input_text":
			err = s.restoreField(part, "text", lane, stream, final)
		case "refusal":
			err = s.restoreField(part, "refusal", lane, stream, final)
		case "thinking":
			err = s.restoreField(part, "thinking", lane, stream, final)
		case "redacted_thinking": // Opaque signed payloads remain unchanged.
		default:
			return ErrUnsupported
		}
		if err != nil {
			return err
		}
		parts[i], err = common.Marshal(part)
		if err != nil {
			return ErrUnsupported
		}
	}
	return setJSON(value, field, parts)
}

func noToolResponse(value object) error {
	for _, field := range []string{"tool_calls", "function_call", "functionCall", "functionResponse"} {
		if raw, ok := value[field]; ok && !optionalEmpty(raw) {
			return ErrUnsupported
		}
	}
	return nil
}

func (s *Session) restoreMessage(message object, key string, stream, final bool) error {
	if err := noToolResponse(message); err != nil {
		return err
	}
	if err := s.restoreContent(message, "content", key+"/content", stream, final); err != nil {
		return err
	}
	for _, field := range []string{"refusal", "reasoning", "reasoning_content", "reasoning_text"} {
		if err := s.restoreField(message, field, key+"/"+field, stream, final); err != nil {
			return err
		}
	}
	// Finish may arrive in a separate delta containing no content fields.
	if stream && final {
		for _, field := range []string{"content", "refusal", "reasoning", "reasoning_content", "reasoning_text"} {
			lane := key + "/" + field
			if _, ok := s.pending[lane]; ok {
				tail := s.restoreDelta(lane, "", true)
				if tail != "" {
					if err := setJSON(message, field, tail); err != nil {
						return err
					}
				}
			}
		}
	}
	return nil
}

func (s *Session) restoreResponse(value object, stream bool) error {
	if raw, ok := value["choices"]; ok {
		choices, err := decodeArray(raw)
		if err != nil {
			return err
		}
		for i, item := range choices {
			choice, err := decodeObject(item)
			if err != nil {
				return err
			}
			index, err := streamIndex(choice, "index", i)
			if err != nil {
				return err
			}
			key := "chat/" + index
			final := false
			if raw, ok := choice["finish_reason"]; ok && !optionalEmpty(raw) {
				final = true
			}
			for _, field := range []string{"delta", "message"} {
				if raw, ok := choice[field]; ok {
					message, e := decodeObject(raw)
					if e != nil {
						return e
					}
					if e = s.restoreMessage(message, key, stream && field == "delta", final); e != nil {
						return e
					}
					choice[field], _ = common.Marshal(message)
				}
			}
			if err = s.restoreField(choice, "text", key+"/text", stream, final); err != nil {
				return err
			}
			if stream && final {
				if tail := s.restoreDelta(key+"/text", "", true); tail != "" {
					if err = setJSON(choice, "text", tail); err != nil {
						return err
					}
				}
			}
			if err = noToolResponse(choice); err != nil {
				return err
			}
			choices[i], _ = common.Marshal(choice)
		}
		if err = setJSON(value, "choices", choices); err != nil {
			return err
		}
	}
	if raw, ok := value["candidates"]; ok {
		candidates, err := decodeArray(raw)
		if err != nil {
			return err
		}
		for i, item := range candidates {
			candidate, err := decodeObject(item)
			if err != nil {
				return err
			}
			index, err := streamIndex(candidate, "index", i)
			if err != nil {
				return err
			}
			final := false
			if raw, ok := candidate["finishReason"]; ok && !optionalEmpty(raw) {
				final = true
			}
			if raw, ok := candidate["content"]; ok {
				content, e := decodeObject(raw)
				if e != nil {
					return e
				}
				parts, e := decodeArray(content["parts"])
				if e != nil {
					return e
				}
				for j, item := range parts {
					part, e := decodeObject(item)
					if e != nil || noToolResponse(part) != nil {
						return ErrUnsupported
					}
					if _, ok := part["inlineData"]; ok {
						return ErrUnsupported
					}
					if _, ok := part["fileData"]; ok {
						return ErrUnsupported
					}
					lane := "gemini/" + index + "/" + strconv.Itoa(j)
					if e = s.restoreField(part, "text", lane, stream, final); e != nil {
						return e
					}
					parts[j], _ = common.Marshal(part)
				}
				content["parts"], _ = common.Marshal(parts)
				candidate["content"], _ = common.Marshal(content)
			}
			if stream && final {
				prefix := "gemini/" + index + "/"
				for key := range s.pending {
					if strings.HasPrefix(key, prefix) {
						s.restoreDelta(key, "", true)
					}
				}
			}
			candidates[i], _ = common.Marshal(candidate)
		}
		if err = setJSON(value, "candidates", candidates); err != nil {
			return err
		}
	}
	if raw, ok := value["output"]; ok {
		output, err := decodeArray(raw)
		if err != nil {
			return err
		}
		for i, item := range output {
			part, err := decodeObject(item)
			if err != nil {
				return err
			}
			kind, _ := stringValue(part["type"])
			switch kind {
			case "message":
				if err = s.restoreMessage(part, "output/"+strconv.Itoa(i), false, true); err != nil {
					return err
				}
			case "reasoning":
				if raw, ok := part["summary"]; ok {
					summary, e := decodeArray(raw)
					if e != nil {
						return e
					}
					for j, item := range summary {
						text, e := decodeObject(item)
						if e != nil {
							return e
						}
						if e = s.restoreField(text, "text", "", false, true); e != nil {
							return e
						}
						summary[j], _ = common.Marshal(text)
					}
					part["summary"], _ = common.Marshal(summary)
				}
			default:
				return ErrUnsupported
			}
			output[i], _ = common.Marshal(part)
		}
		if err = setJSON(value, "output", output); err != nil {
			return err
		}
	}
	if err := s.restoreMessage(value, "root", false, true); err != nil {
		return err
	}
	if err := s.restoreField(value, "output_text", "", false, true); err != nil {
		return err
	}
	if raw, ok := value["error"]; ok && !optionalEmpty(raw) {
		detail, err := decodeObject(raw)
		if err != nil {
			return err
		}
		if err = s.restoreField(detail, "message", "", false, true); err != nil {
			return err
		}
		value["error"], _ = common.Marshal(detail)
	}
	return nil
}

func (s *Session) RestoreJSON(body []byte) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil, ErrClosed
	}
	value, err := decodeObject(body)
	if err != nil {
		return nil, err
	}
	s.restoreBudget = maxRestoredTextBytes
	if err = s.restoreResponse(value, false); err != nil {
		return nil, err
	}
	if s.incomplete {
		return nil, ErrIncomplete
	}
	result, err := common.Marshal(value)
	if err != nil {
		return nil, ErrUnsupported
	}
	return result, nil
}

// RestoreEvent accepts one SSE data payload, not its event:/data: framing.
// The caller must call Finish at EOF and must not emit DONE after any error.
// Tool events are unsupported, matching the text-only request contract.
func (s *Session) RestoreEvent(data []byte) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil, ErrClosed
	}
	if bytes.Equal(bytes.TrimSpace(data), []byte("[DONE]")) {
		if err := s.finish(); err != nil {
			return nil, err
		}
		return data, nil
	}
	value, err := decodeObject(data)
	if err != nil {
		return nil, err
	}
	s.restoreBudget = maxRestoredTextBytes
	kind, _ := stringValue(value["type"])
	switch kind {
	case "response.output_text.delta", "response.refusal.delta", "response.reasoning_text.delta", "response.reasoning_summary_text.delta":
		output, e := streamIndex(value, "output_index", 0)
		if e != nil {
			return nil, e
		}
		content, e := streamIndex(value, "content_index", 0)
		if e != nil {
			return nil, e
		}
		summary, e := streamIndex(value, "summary_index", 0)
		if e != nil {
			return nil, e
		}
		family := strings.TrimSuffix(kind, ".delta")
		key := family + "/" + output + "/" + content + "/" + summary
		if err = s.restoreField(value, "delta", key, true, false); err != nil {
			return nil, err
		}
	case "response.output_text.done", "response.refusal.done", "response.reasoning_text.done", "response.reasoning_summary_text.done":
		output, e := streamIndex(value, "output_index", 0)
		if e != nil {
			return nil, e
		}
		content, e := streamIndex(value, "content_index", 0)
		if e != nil {
			return nil, e
		}
		summary, e := streamIndex(value, "summary_index", 0)
		if e != nil {
			return nil, e
		}
		key := strings.TrimSuffix(kind, ".done") + "/" + output + "/" + content + "/" + summary
		// Done text is a snapshot, not another delta. Never append it to the lane.
		if s.pending[key] != "" {
			return nil, ErrIncomplete
		}
		field := "text"
		if kind == "response.refusal.done" {
			field = "refusal"
		}
		if err = s.restoreField(value, field, "", false, true); err != nil {
			return nil, err
		}
	case "content_block_delta":
		index, e := streamIndex(value, "index", 0)
		if e != nil {
			return nil, e
		}
		delta, e := decodeObject(value["delta"])
		if e != nil {
			return nil, e
		}
		deltaType, _ := stringValue(delta["type"])
		switch deltaType {
		case "text_delta":
			err = s.restoreField(delta, "text", "claude/"+index+"/text", true, false)
		case "thinking_delta":
			err = s.restoreField(delta, "thinking", "claude/"+index+"/thinking", true, false)
		case "signature_delta": // A signature is opaque protocol metadata.
		default:
			return nil, ErrUnsupported
		}
		if err != nil {
			return nil, err
		}
		value["delta"], _ = common.Marshal(delta)
	case "content_block_start":
		index, e := streamIndex(value, "index", 0)
		if e != nil {
			return nil, e
		}
		block, e := decodeObject(value["content_block"])
		if e != nil {
			return nil, e
		}
		blockType, _ := stringValue(block["type"])
		switch blockType {
		case "text":
			err = s.restoreField(block, "text", "claude/"+index+"/text", true, false)
		case "thinking":
			err = s.restoreField(block, "thinking", "claude/"+index+"/thinking", true, false)
		case "redacted_thinking":
		default:
			return nil, ErrUnsupported
		}
		if err != nil {
			return nil, err
		}
		value["content_block"], _ = common.Marshal(block)
	case "content_block_stop":
		index, e := streamIndex(value, "index", 0)
		if e != nil {
			return nil, e
		}
		for key := range s.pending {
			if strings.HasPrefix(key, "claude/"+index+"/") {
				return nil, ErrIncomplete
			}
		}
	case "message_stop", "response.completed", "response.failed", "response.incomplete":
		if err = s.finish(); err != nil {
			return nil, err
		}
	case "response.function_call_arguments.delta", "response.function_call_arguments.done":
		return nil, ErrUnsupported
	case "response.output_item.added", "response.output_item.done":
		item, e := decodeObject(value["item"])
		if e != nil {
			return nil, e
		}
		itemType, _ := stringValue(item["type"])
		if itemType != "message" && itemType != "reasoning" {
			return nil, ErrUnsupported
		}
		wrapper := object{}
		if e = setJSON(wrapper, "output", []object{item}); e != nil {
			return nil, e
		}
		if e = s.restoreResponse(wrapper, false); e != nil {
			return nil, e
		}
		parts, e := decodeArray(wrapper["output"])
		if e != nil {
			return nil, e
		}
		value["item"] = parts[0]
	case "response.content_part.added", "response.content_part.done":
		part, e := decodeObject(value["part"])
		if e != nil {
			return nil, e
		}
		partType, _ := stringValue(part["type"])
		if partType != "output_text" && partType != "refusal" {
			return nil, ErrUnsupported
		}
		if e = s.restoreField(part, "text", "", false, true); e != nil {
			return nil, e
		}
		if e = s.restoreField(part, "refusal", "", false, true); e != nil {
			return nil, e
		}
		value["part"], _ = common.Marshal(part)
	case "", "message", "message_start", "message_delta", "ping", "error", "response.created", "response.in_progress", "response.queued":
	default:
		return nil, ErrUnsupported
	}
	if raw, ok := value["response"]; ok {
		response, e := decodeObject(raw)
		if e != nil {
			return nil, e
		}
		if e = s.restoreResponse(response, false); e != nil {
			return nil, e
		}
		value["response"], _ = common.Marshal(response)
	}
	if raw, ok := value["message"]; ok && kind == "message_start" {
		message, e := decodeObject(raw)
		if e != nil {
			return nil, e
		}
		if e = s.restoreResponse(message, false); e != nil {
			return nil, e
		}
		value["message"], _ = common.Marshal(message)
	}
	if err = s.restoreResponse(value, true); err != nil {
		return nil, err
	}
	if s.incomplete {
		return nil, ErrIncomplete
	}
	result, err := common.Marshal(value)
	if err != nil {
		return nil, ErrUnsupported
	}
	return result, nil
}
