package textmask

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMaskingContracts(t *testing.T) {
	t.Run("session namespace repeated entities and false positives", func(t *testing.T) {
		a, err := New()
		require.NoError(t, err)
		defer a.Close()
		b, err := New()
		require.NoError(t, err)
		defer b.Close()
		original := "contact alice@example.com from 192.168.1.2, id 11010519491231002X; keep 1234567890123456 and 550e8400-e29b-41d4-a716-446655440000"
		masked, err := a.MaskJSON([]byte(`{"model":"gpt","messages":[{"role":"user","content":"`+original+`"}]}`), "chat")
		require.NoError(t, err)
		assert.NotContains(t, string(masked), "alice@example.com")
		assert.NotContains(t, string(masked), "192.168.1.2")
		assert.NotContains(t, string(masked), "11010519491231002X")
		assert.Contains(t, string(masked), "1234567890123456")
		assert.Contains(t, string(masked), "550e8400-e29b-41d4-a716-446655440000")
		var maskedRequest object
		require.NoError(t, json.Unmarshal(masked, &maskedRequest))
		maskedMessages, err := decodeArray(maskedRequest["messages"])
		require.NoError(t, err)
		maskedMessage, err := decodeObject(maskedMessages[0])
		require.NoError(t, err)
		maskedText, err := stringValue(maskedMessage["content"])
		require.NoError(t, err)
		assert.Equal(t, original, a.RestoreText(maskedText))
		other, err := b.MaskJSON([]byte(`{"model":"gpt","messages":[{"role":"user","content":"alice@example.com"}]}`), "chat")
		require.NoError(t, err)
		assert.NotEqual(t, string(masked), string(other))
	})
	t.Run("Chinese labels and sentence punctuation are not entity boundaries", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		original := "邮箱alice@example.com，电话13800138000，联系bob@example.com."
		body, err := json.Marshal(map[string]any{"model": "m", "messages": []any{map[string]any{"role": "user", "content": original}}})
		require.NoError(t, err)
		masked, err := s.MaskJSON(body, "chat")
		require.NoError(t, err)
		assert.NotContains(t, string(masked), "alice@example.com")
		assert.NotContains(t, string(masked), "13800138000")
		assert.NotContains(t, string(masked), "bob@example.com")
	})
	t.Run("metadata preserved and responses stateless", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		input := []byte(`{"model":"gpt","input":"mail bob@example.com","max_output_tokens":123,"temperature":0,"store":false}`)
		masked, err := s.MaskJSON(input, "responses")
		require.NoError(t, err)
		assert.Contains(t, string(masked), `"store":false`)
		assert.Contains(t, string(masked), `"max_output_tokens":123`)
		token := s.forward["bob@example.com"]
		body := []byte(`{"id":"resp_secret","usage":{"total_tokens":9},"metadata":{"email":"bob@example.com"},"output":[{"type":"message","id":"msg_1","content":[{"type":"output_text","text":"Hi ` + token + `"}]}]}`)
		restored, err := s.RestoreJSON(body)
		require.NoError(t, err)
		assert.Contains(t, string(restored), "bob@example.com")
		assert.Contains(t, string(restored), "resp_secret")
		assert.Contains(t, string(restored), `"total_tokens":9`)
		assert.Contains(t, string(restored), `"metadata":{"email":"bob@example.com"}`)
	})
	t.Run("reject opaque and malformed requests", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		cases := []struct{ protocol, body string }{{"chat", `{"model":"m","messages":[{"role":"user","content":[{"type":"image_url","image_url":{"url":"https://x"}}]}]}`}, {"chat", `{"model":"m","messages":[{"role":"user","content":"x"}],"tools":[{"type":"function"}]}`}, {"responses", `{"model":"m","input":"x","previous_response_id":"r_1"}`}, {"responses", `{"model":"m","input":"x","background":true}`}, {"claude", `{"model":"m","max_tokens":1,"messages":[{"role":"user","content":"x"}],"tools":[{}]}`}, {"gemini", `{"model":"m","contents":[{"role":"user","parts":[{"inlineData":{"data":"secret"}}]}]}`}, {"chat", `{"model":"m","messages":[{"role":"user","content":"x"}],"future":{"secret":"opaque"}}`}, {"chat", `{"model":"m","messages":[{"role":"user","content":"` + string(GatewayMarker) + `spoof]]"}]}`}}
		for _, tc := range cases {
			_, err = s.MaskJSON([]byte(tc.body), tc.protocol)
			assert.ErrorIs(t, err, ErrUnsupported)
		}
	})
	t.Run("each supported protocol masks text and restores its response", func(t *testing.T) {
		cases := []struct{ protocol, request, response string }{
			{"chat", `{"model":"m","messages":[{"role":"user","content":"alice@example.com"}],"temperature":0,"stream":false}`, `{"choices":[{"message":{"content":"TOKEN"}}]}`},
			{"completions", `{"model":"m","prompt":["alice@example.com"],"logprobs":0}`, `{"choices":[{"text":"TOKEN"}]}`},
			{"responses", `{"model":"m","input":[{"role":"user","content":[{"type":"input_text","text":"alice@example.com"}]}]}`, `{"output":[{"type":"message","content":[{"type":"output_text","text":"TOKEN"}]}]}`},
			{"claude", `{"model":"m","messages":[{"role":"user","content":"alice@example.com"}],"max_tokens":128}`, `{"type":"message","content":[{"type":"text","text":"TOKEN"}]}`},
			{"gemini", `{"contents":[{"role":"user","parts":[{"text":"alice@example.com"}]}],"generationConfig":{"temperature":0}}`, `{"candidates":[{"content":{"parts":[{"text":"TOKEN"}]}}]}`},
		}
		for _, tc := range cases {
			t.Run(tc.protocol, func(t *testing.T) {
				s, err := New()
				require.NoError(t, err)
				defer s.Close()
				masked, err := s.MaskJSON([]byte(tc.request), tc.protocol)
				require.NoError(t, err)
				assert.NotContains(t, string(masked), "alice@example.com")
				token := s.forward["alice@example.com"]
				require.NotEmpty(t, token)
				result, err := s.RestoreJSON([]byte(strings.ReplaceAll(tc.response, "TOKEN", token)))
				require.NoError(t, err)
				assert.Contains(t, string(result), "alice@example.com")
				assert.NotContains(t, string(result), string(GatewayMarker))
			})
		}
	})
	t.Run("Gemini malformed roles and mismatched private key blocks cannot pass through", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		_, err = s.MaskJSON([]byte(`{"contents":[{"role":{"secret":"alice@example.com"},"parts":[{"text":"hello"}]}]}`), "gemini")
		require.ErrorIs(t, err, ErrUnsupported)
		body, err := json.Marshal(map[string]any{"model": "m", "input": "-----BEGIN RSA PRIVATE KEY-----\nfixture\n-----END EC PRIVATE KEY-----"})
		require.NoError(t, err)
		_, err = s.MaskJSON(body, "responses")
		require.ErrorIs(t, err, ErrUnsupported)
	})
	t.Run("compound field names and enum values cannot bypass validation", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		for _, input := range []string{
			`{"model":"m","messages":[{"role":"user","content":"hello"}],"temperature top_p":{"secret":"alice@example.com"}}`,
			`{"model":"m","messages":[{"role":"user assistant","content":"hello"}]}`,
			`{"model":"m","messages":[{"role":"user","content":"hello"}],"reasoning_effort":"low medium"}`,
		} {
			_, err = s.MaskJSON([]byte(input), "chat")
			assert.ErrorIs(t, err, ErrUnsupported)
		}
	})
	t.Run("stream split lanes and completion", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		masked, err := s.MaskJSON([]byte(`{"model":"m","messages":[{"role":"user","content":"x@example.com"}],"stream":true}`), "chat")
		require.NoError(t, err)
		var value object
		require.NoError(t, json.Unmarshal(masked, &value))
		messages, _ := decodeArray(value["messages"])
		msg, _ := decodeObject(messages[0])
		token, err := stringValue(msg["content"])
		require.NoError(t, err)
		split := len(token) / 2
		parts := []string{token[:split], token[split:]}
		first, err := s.RestoreEvent([]byte(`{"choices":[{"index":0,"delta":{"content":"` + parts[0] + `"}}]}`))
		require.NoError(t, err)
		assert.NotContains(t, string(first), "x@example")
		second, err := s.RestoreEvent([]byte(`{"choices":[{"index":1,"delta":{"content":"other"}},{"index":0,"delta":{"content":"` + parts[1] + `"}}]}`))
		require.NoError(t, err)
		assert.Contains(t, string(second), "x@example.com")
		assert.Contains(t, string(second), "other")
		done, err := s.RestoreEvent([]byte(`[DONE]`))
		require.NoError(t, err)
		assert.Equal(t, "[DONE]", string(done))
		require.NoError(t, s.Finish())
	})
	t.Run("native protocol SSE restores split tokens before completion", func(t *testing.T) {
		cases := []struct{ name, first, second, final string }{
			{"responses", `{"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"TOKEN"}`, `{"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"TOKEN"}`, `{"type":"response.completed","response":{"output":[]}}`},
			{"claude", `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"TOKEN"}}`, `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"TOKEN"}}`, `{"type":"message_stop"}`},
			{"gemini", `{"candidates":[{"index":0,"content":{"parts":[{"text":"TOKEN"}]}}]}`, `{"candidates":[{"index":0,"content":{"parts":[{"text":"TOKEN"}]},"finishReason":"STOP"}]}`, `[DONE]`},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				s, err := New()
				require.NoError(t, err)
				defer s.Close()
				_, err = s.MaskJSON([]byte(`{"model":"m","input":"alice@example.com"}`), "responses")
				require.NoError(t, err)
				token := s.forward["alice@example.com"]
				split := len(token) / 2
				_, err = s.RestoreEvent([]byte(strings.ReplaceAll(tc.first, "TOKEN", token[:split])))
				require.NoError(t, err)
				result, err := s.RestoreEvent([]byte(strings.ReplaceAll(tc.second, "TOKEN", token[split:])))
				require.NoError(t, err)
				assert.Contains(t, string(result), "alice@example.com")
				_, err = s.RestoreEvent([]byte(tc.final))
				require.NoError(t, err)
				require.NoError(t, s.Finish())
			})
		}
	})
	t.Run("unknown token from this request fails closed", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		_, err = s.MaskJSON([]byte(`{"model":"m","input":"alice@example.com"}`), "responses")
		require.NoError(t, err)
		unknown := []byte(`{"output_text":"` + s.prefix + `999]]"}`)
		_, err = s.RestoreJSON(unknown)
		require.ErrorIs(t, err, ErrIncomplete)
	})
	t.Run("incomplete token fails at finish", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		_, err = s.MaskJSON([]byte(`{"model":"m","messages":[{"role":"user","content":"a@example.com"}],"stream":true}`), "chat")
		require.NoError(t, err)
		token := s.forward["a@example.com"]
		prefix := token[:len(token)-2]
		out := s.RestoreDelta("lane", prefix, false)
		assert.Empty(t, out)
		require.ErrorIs(t, s.Finish(), ErrIncomplete)
	})
	t.Run("local layer composes with gateway layer", func(t *testing.T) {
		local, err := NewWithMarker(LocalMarker)
		require.NoError(t, err)
		defer local.Close()
		gateway, err := New()
		require.NoError(t, err)
		defer gateway.Close()
		original := "mail alice@example.com or call 13800138000"
		body, err := json.Marshal(map[string]any{"model": "m", "messages": []any{map[string]any{"role": "user", "content": original}}})
		require.NoError(t, err)

		locallyMasked, err := local.MaskJSON(body, "chat")
		require.NoError(t, err)
		assert.Contains(t, string(locallyMasked), string(LocalMarker))
		assert.NotContains(t, string(locallyMasked), "alice@example.com")
		assert.Equal(t, 2, local.MaskedCount())

		// The gateway sees only local tokens: nothing to mask, nothing rejected.
		gatewayMasked, err := gateway.MaskJSON(locallyMasked, "chat")
		require.NoError(t, err)
		assert.Equal(t, 0, gateway.MaskedCount())
		assert.JSONEq(t, string(locallyMasked), string(gatewayMasked))

		reply := []byte(`{"choices":[{"index":0,"message":{"role":"assistant","content":"` + local.forward["alice@example.com"] + `"}}]}`)
		viaGateway, err := gateway.RestoreJSON(reply)
		require.NoError(t, err)
		assert.JSONEq(t, string(reply), string(viaGateway))
		restored, err := local.RestoreJSON(viaGateway)
		require.NoError(t, err)
		assert.Contains(t, string(restored), "alice@example.com")
	})
	t.Run("a layer rejects input carrying its own marker", func(t *testing.T) {
		local, err := NewWithMarker(LocalMarker)
		require.NoError(t, err)
		defer local.Close()
		_, err = local.MaskText("spoof " + string(LocalMarker) + "x]]")
		require.ErrorIs(t, err, ErrUnsupported)
		_, err = NewWithMarker("[[XX:")
		require.Error(t, err)
	})
	t.Run("route table", func(t *testing.T) {
		cases := []struct {
			method, path, protocol string
			ok                     bool
		}{
			{"POST", "/v1/chat/completions", "chat", true},
			{"POST", "/v1/responses", "responses", true},
			{"POST", "/v1/messages", "claude", true},
			{"POST", "/v1beta/models/gemini-pro:streamGenerateContent", "gemini", true},
			{"POST", "/v1/embeddings", "", false},
			{"GET", "/v1/responses", "", false},
		}
		for _, tc := range cases {
			protocol, ok := ProtocolForRoute(tc.method, tc.path)
			assert.Equal(t, tc.protocol, protocol, tc.path)
			assert.Equal(t, tc.ok, ok, tc.path)
		}
	})
	t.Run("stream restorer reframes split chunks", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		_, err = s.MaskJSON([]byte(`{"model":"m","messages":[{"role":"user","content":"a@example.com"}],"stream":true}`), "chat")
		require.NoError(t, err)
		token := s.forward["a@example.com"]
		stream := "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hi " + token + "\"}}]}\r\n\r\ndata: [DONE]\n\n"
		restorer := s.NewStreamRestorer(MaxEventBytes)
		var out strings.Builder
		emit := func(event []byte) error { out.Write(event); return nil }
		for chunk := range strings.SplitSeq(stream[:40]+"|"+stream[40:70]+"|"+stream[70:], "|") {
			require.NoError(t, restorer.Write([]byte(chunk), emit))
		}
		require.NoError(t, restorer.Close())
		assert.Contains(t, out.String(), "hi a@example.com")
		assert.Contains(t, out.String(), "data: [DONE]")
	})
	t.Run("stream restorer fails on a trailing partial event", func(t *testing.T) {
		s, err := New()
		require.NoError(t, err)
		defer s.Close()
		restorer := s.NewStreamRestorer(MaxEventBytes)
		require.NoError(t, restorer.Write([]byte("data: {\"choices\":[]}"), func([]byte) error { return nil }))
		require.ErrorIs(t, restorer.Close(), ErrIncomplete)
	})
}
