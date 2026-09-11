# Video Multiplier AI

Aplicação web para combinar automaticamente vídeos de **Gancho + Desenvolvimento + CTA** e gerar variações para TikTok Shop em alta qualidade.

## O que faz

- Até **5 ganchos**.
- Até **5 desenvolvimentos**.
- Até **5 CTAs**.
- Gera todas as combinações possíveis (máximo **125 vídeos**).
- Normaliza cada clipe **uma única vez** para 1080×1920, 30 fps, H.264 e AAC.
- Combina os clipes normalizados usando **stream copy**, evitando uma nova recompressão em cada variação.
- Baixa tudo em **ZIP**.
- Nomes automáticos: `G01_D01_C01.mp4`, `G01_D01_C02.mp4`, etc.

## Por que esta versão preserva melhor a qualidade

Em vez de usar `MediaRecorder` ou exportação do navegador, o projeto usa **FFmpeg nativo** no backend.

Qualidade padrão:

- 1080 × 1920 (9:16)
- H.264 / High Profile
- CRF 18
- 30 fps
- AAC 192 kbps
- 48 kHz estéreo

Há também os modos CRF 16 (máxima) e CRF 21 (compacta).

## Testar no Windows / macOS / Linux

Requisitos:

- Node.js 20 ou superior

O FFmpeg e o FFprobe são instalados automaticamente via dependências NPM (`ffmpeg-static` e `ffprobe-static`).

```bash
npm install
npm start
```

Abra:

```text
http://localhost:3000
```

## Subir no GitHub

Este diretório já pode ser usado como repositório:

```bash
git init
git add .
git commit -m "Video Multiplier AI"
git branch -M main
git remote add origin SEU_REPOSITORIO
 git push -u origin main
```

> GitHub Pages sozinho não executa o backend Node/FFmpeg. Use GitHub para guardar o código e publique o serviço em Render, Railway, Fly.io, VPS ou outra plataforma que execute Node/Docker.

## Docker

```bash
docker build -t video-multiplier-ai .
docker run --rm -p 3000:3000 video-multiplier-ai
```

## Observações importantes

Gerar 125 vídeos pode exigir vários GB temporários dependendo da duração dos clipes. Para produção, prefira servidor com SSD e pelo menos 2–4 GB de RAM.

A pasta `work/` é temporária. Por padrão, trabalhos são removidos após 4 horas.

Variáveis opcionais:

```text
PORT=3000
MAX_UPLOAD_MB=800
JOB_TTL_HOURS=4
```

## Jeito mais fácil no Windows

1. Extraia o ZIP.
2. Instale Node.js 20+ se ainda não tiver.
3. Dê dois cliques em `INICIAR-WINDOWS.bat`.
4. Na primeira vez, ele instala as dependências e abre `http://localhost:3000` automaticamente.

Não abra apenas `public/index.html` com duplo clique: a interface depende do backend Node/FFmpeg para processar os vídeos.
