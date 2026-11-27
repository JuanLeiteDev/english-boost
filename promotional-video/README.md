# English Boost: vídeo de apresentação (Remotion)

Subprojeto isolado. Não altera a app (`../app`) nem os dados de aprendizagem.

- Planeamento, roteiro e storyboard: [docs/planeamento.md](docs/planeamento.md)
- Amostras de voz: `narration/samples/`

## Ambiente (tudo local, sem instalações globais)

```bash
source promotional-video/env.sh          # Node 24 LTS local + binários do projeto
cd promotional-video
npm run dev                              # Remotion Studio
```

Recriar do zero: Node em `.tools/node` (tarball oficial nodejs.org), `npm i`,
`PLAYWRIGHT_BROWSERS_PATH=$PWD/.tools/ms-playwright npx playwright install chromium`,
`uv venv .venv --python 3.12 && uv pip install --python .venv/bin/python edge-tts faster-whisper numpy soundfile`.

Remotion: licença gratuita (uso individual, projeto pessoal).
