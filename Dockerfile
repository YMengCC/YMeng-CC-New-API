FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS builder

WORKDIR /build/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY ./web ./
COPY ./VERSION /build/VERSION
RUN DISABLE_ESLINT_PLUGIN='true' VITE_REACT_APP_VERSION=$(cat /build/VERSION) bun run build

# 萌萌的安全小屋 downloads are cross-compiled once on the build platform, never
# under QEMU and never with the image's GOOS/GOARCH, then embedded below.
FROM --platform=$BUILDPLATFORM golang:1.26.10-alpine@sha256:9ce231b28998b32e116927c61aa5c406183061d4f3f2d61b292c88e7f6bdf7ca AS safehouse
ENV GOWORK=off
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}
WORKDIR /build/safehouse
COPY textmask/ /build/textmask/
COPY safehouse/ /build/safehouse/
COPY LICENSE NOTICE /build/
COPY VERSION /build/VERSION
RUN --mount=type=cache,target=/go/pkg/mod,sharing=locked \
    --mount=type=cache,target=/root/.cache/go-build,sharing=locked \
    go run ./cmd/pack -out /artifacts -version "$(cat /build/VERSION)"

FROM golang:1.26.10-alpine@sha256:9ce231b28998b32e116927c61aa5c406183061d4f3f2d61b292c88e7f6bdf7ca AS builder2
ENV GO111MODULE=on CGO_ENABLED=0 GOWORK=off
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}

ARG TARGETOS
ARG TARGETARCH
ENV GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64}
ENV GOEXPERIMENT=greenteagc

WORKDIR /build

ADD go.mod go.sum ./
# relaykit and tokenkit are local submodules referenced via replace; their
# go.mod files must be present for go mod download to resolve the main module graph.
ADD relaykit/go.mod ./relaykit/go.mod
ADD tokenkit/go.mod ./tokenkit/go.mod
ADD textmask/go.mod ./textmask/go.mod
RUN --mount=type=cache,target=/go/pkg/mod,sharing=locked \
    for attempt in 1 2 3 4 5; do \
      go mod download && break; \
      if [ "$attempt" -eq 5 ]; then exit 1; fi; \
      sleep 3; \
    done

COPY . .
COPY --from=builder /build/web/dist ./web/dist
COPY --from=safehouse /artifacts/ ./safehousebundle/artifacts/
RUN --mount=type=cache,target=/go/pkg/mod,sharing=locked \
    --mount=type=cache,target=/root/.cache/go-build,sharing=locked \
    go build -pgo="$(go list -m -f '{{.Dir}}' github.com/Calcium-Ion/moejs)/default.pgo" -ldflags "-s -w -X 'github.com/QuantumNous/new-api/common.Version=$(cat VERSION)'" -o new-api

# Office worker for the playground office mode: Node and the Codex CLI. It is a
# separate build target (`--target office-worker`) so the gateway image keeps its
# current runtime. The Codex bubblewrap sandbox needs user namespaces, which the
# compose files enable for this service only.
FROM node:22-bookworm-slim@sha256:be979e5523c76fa4d5ca4ebd3099078f220aa47ec39c48ad5b5df9314debd6eb AS office-worker

ENV NODE_ENV=production
WORKDIR /opt/office
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*
COPY office/package.json office/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force
COPY office/src ./src

EXPOSE 8090
ENTRYPOINT ["node", "src/server.mjs"]

FROM debian:bookworm-slim@sha256:f06537653ac770703bc45b4b113475bd402f451e85223f0f2837acbf89ab020a

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tzdata libasan8 wget \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

COPY --from=builder2 /build/new-api /
COPY LICENSE NOTICE THIRD-PARTY-LICENSES.md /licenses/
EXPOSE 3000
WORKDIR /data
ENTRYPOINT ["/new-api"]
