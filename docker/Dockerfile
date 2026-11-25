# English Boost: study web app + Claude Code + Codex CLIs, identical on Linux, macOS and Windows.
# Built by compose.yaml (see README "Docker"). Versions are pinned for reproducible builds;
# bump them deliberately.
FROM python:3.12-slim-bookworm

ARG CODEX_VERSION=0.167.2
ARG GH_VERSION=2.103.3
ARG CLAUDE_CHANNEL=stable
ARG UID=1000
ARG GID=1000

RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl ca-certificates tzdata poppler-utils procps less ripgrep \
 && rm -rf /var/lib/apt/lists/*

# Codex CLI (official static binaries from github.com/openai/codex releases):
# `codex` plus its companion `codex-code-mode-host`, which runs Codex's shell/tools and
# must sit next to `codex`.
RUN set -eux; \
    case "$(uname -m)" in x86_64) t=x86_64 ;; aarch64|arm64) t=aarch64 ;; *) echo "unsupported arch"; exit 1 ;; esac; \
    rel="https://github.com/openai/codex/releases/download/rust-v${CODEX_VERSION}"; \
    curl -fsSL -o /tmp/codex.tgz "$rel/codex-${t}-unknown-linux-musl.tar.gz"; \
    tar xzf /tmp/codex.tgz -C /tmp; install -m 0755 "/tmp/codex-${t}-unknown-linux-musl" /usr/local/bin/codex; \
    curl -fsSL -o /tmp/codex-cmh.tgz "$rel/codex-code-mode-host-${t}-unknown-linux-musl.tar.gz"; \
    tar xzf /tmp/codex-cmh.tgz -C /tmp; install -m 0755 "/tmp/codex-code-mode-host-${t}-unknown-linux-musl" /usr/local/bin/codex-code-mode-host; \
    rm -rf /tmp/codex*; codex --version

# GitHub CLI (for "Guardar no Git" → push), checksum-verified
RUN set -eux; \
    case "$(uname -m)" in x86_64) a=amd64 ;; aarch64|arm64) a=arm64 ;; esac; \
    base="https://github.com/cli/cli/releases/download/v${GH_VERSION}"; f="gh_${GH_VERSION}_linux_${a}.tar.gz"; \
    curl -fsSL -o "/tmp/$f" "$base/$f"; curl -fsSL -o /tmp/gh_sums.txt "$base/gh_${GH_VERSION}_checksums.txt"; \
    (cd /tmp && grep " $f\$" gh_sums.txt | sha256sum -c -); \
    tar xzf "/tmp/$f" -C /tmp; install -m 0755 "/tmp/gh_${GH_VERSION}_linux_${a}/bin/gh" /usr/local/bin/gh; \
    rm -rf /tmp/gh*; gh --version

# Python deps for the pdf/docx/xlsx and literature-review skills
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

# Local speech-to-text for the microphone button (Whisper, CPU). The model itself is downloaded
# on first start into the stt-models volume (STT_PRELOAD) and then works offline.
# av is pinned: faster-whisper 1.1.1 calls av.open(..., metadata_errors=...), removed in av 14+.
ARG FASTER_WHISPER_VERSION=1.1.1
RUN pip install --no-cache-dir "faster-whisper==${FASTER_WHISPER_VERSION}" "av==13.1.0"

COPY docker/entrypoint.sh /usr/local/bin/eb-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/eb-entrypoint && chmod 0755 /usr/local/bin/eb-entrypoint

# Non-root user (UID/GID match the host on Linux so files in the project stay yours)
RUN groupadd -g "${GID}" student && useradd -m -u "${UID}" -g "${GID}" -s /bin/bash student \
 && mkdir -p /home/student/.claude /home/student/.codex /home/student/.config/gh /home/student/.cache/whisper \
 && chown -R student:student /home/student
USER student

# Claude Code CLI (official native installer)
RUN curl -fsSL https://claude.ai/install.sh | bash -s "${CLAUDE_CHANNEL}"

ENV PATH=/home/student/.local/bin:$PATH \
    CLAUDE_CONFIG_DIR=/home/student/.claude \
    CODEX_HOME=/home/student/.codex \
    CODEX_SANDBOX=danger-full-access \
    STT_PRELOAD=1 \
    STT_MODELS_DIR=/home/student/.cache/whisper \
    PYTHONUNBUFFERED=1
WORKDIR /workspace
EXPOSE 8765
ENTRYPOINT ["eb-entrypoint"]
CMD ["serve"]
