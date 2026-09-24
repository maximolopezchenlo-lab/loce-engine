# LiveVoice Open-Caption Engine (LOCE)

*Distributed, Real-Time Octalingual Captioning & Translation Engine for High-Concurrency Tech Conferences.*

[![Release: v1.0.0](https://img.shields.io/badge/Release-v1.0.0-blue.svg)](https://github.com/maximolopezchenlo-lab/loce-engine/releases)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Tests: 38/38 Passing](https://img.shields.io/badge/Tests-38%2F38%20Passing-brightgreen.svg)]()
[![Architecture: Distributed Pub/Sub](https://img.shields.io/badge/Architecture-Distributed%20Pub%2FSub-blueviolet.svg)]()
[![Latency: P95 < 12ms](https://img.shields.io/badge/Latency-P95%20%3C%2012ms-brightgreen.svg)]()
[![Concurrency: 32 Stages Verified](https://img.shields.io/badge/Concurrency-32%20Stages%20Verified-brightgreen.svg)]()
[![Languages: 8](https://img.shields.io/badge/Languages-EN%20%7C%20ES%20%7C%20PT%20%7C%20FR%20%7C%20DE%20%7C%20IT%20%7C%20RU%20%7C%20ZH-orange.svg)]()
[![Inference: Gemini Live & Gemma 2](https://img.shields.io/badge/Inference-Gemini%20Live%20API%20%7C%20Gemma%202%20Local-purple.svg)]()

---

**LOCE (LiveVoice Open-Caption Engine)** is an enterprise-grade, open-source distributed engine designed for **real-time audio transcription and simultaneous octalingual translation** (English, Español, Português, Français, Deutsch, Italiano, Русский, and 中文). 

Built specifically for high-concurrency technology conferences (such as Nerdearla, PyCon, or KubeCon), keynotes, and hybrid broadcasts, LOCE replaces expensive, vendor-locked proprietary captioning systems with an open, self-hosted, ultra-low-latency architecture. It orchestrates **32+ concurrent stages in parallel**, dispatching real-time captions with sub-15ms broadcast latency to thousands of simultaneous OBS overlays and audience mobile devices.

---

## 🏗️ Arquitectura de Producción de Extremo a Extremo

LOCE implementa un desacoplamiento estricto en capas independientes: **Ingesta de Audio**, **Normalización y VAD**, **Inferencia Multilingüe Híbrida**, **Distribución Pub/Sub con Backpressure**, y **Entrega en Edge (Broadcast / Web / REST)**.

### Diagrama de Flujo Arquitectónico

```mermaid
flowchart TD
    subgraph Ingestion["1. Capa de Ingesta de Audio (Edge / Speaker)"]
        MIC["🎙️ Browser Live Mic\n(getUserMedia + AudioWorklet)"] -->|16kHz PCM 16-bit Mono| WS_INGEST["WebSocket Ingest\n(/ws/ingest/:roomId)"]
        FILE["🎵 Local Audio File / Demo\n(Web Audio API Downsampling)"] -->|200ms Chunks (6400 B)| WS_INGEST
        OBS_IN["📡 OBS / vMix / RTMP Ingest\n(Hardware Audio Mixer)"] -->|PCM Stream| WS_INGEST
    end

    subgraph Normalization["2. Normalización, Buffering & VAD"]
        WS_INGEST --> RB["Circular RingBuffer\n(Thread-Safe, Fixed Capacity)"]
        RB --> NORM["Audio Normalizer\n(Resampling + Stereo-to-Mono + RMS)"]
        NORM --> VAD["Silero VAD / Frame Slicer\n(Silence Eviction & Voice Bursting)"]
    end

    subgraph Inference["3. Pipeline de Inferencia Multilingüe Híbrida"]
        VAD --> ENGINE{"TranscriptionProvider\n(Abstraction Layer)"}
        ENGINE -->|Cloud TLS WebSocket| GEMINI["⚡ GeminiLiveProvider\n(Gemini Multimodal Live API\nBidiGenerateContent)"]
        ENGINE -->|Local Edge HTTP / Stream| GEMMA["🔒 GemmaLocalProvider\n(Gemma 2 via Ollama / vLLM\n100% Air-Gapped)"]
        ENGINE -->|Simulation / CI| MOCK["🧪 MockStreamingProvider\n(Deterministic Octalingual Engine)"]
        
        GLOSSARY["📚 Technical Glossary Engine\n(Regex Replacements & Contextual Biasing)"] -.->|Inject Context| GEMINI
        GLOSSARY -.->|Inject Context| GEMMA
    end

    subgraph Distribution["4. Message Bus Distribuido & Backpressure"]
        GEMINI -->|Emit Multi-Lang Events| BROKER["PubSubBroker\n(Redis Cluster or Local In-Memory Fallback)"]
        GEMMA -->|Emit Multi-Lang Events| BROKER
        MOCK -->|Emit Multi-Lang Events| BROKER
        
        BROKER --> BP["Smart Backpressure Queue per Subscriber\n(Drop old partials on congestion | NEVER drop finals)"]
    end

    subgraph Delivery["5. Capa de Visualización & Entrega"]
        BP -->|WS /ws/stream/:roomId?lang=...| AUD["📱 Audience Web App (React 19)\n(8 Languages, WCAG AAA, Auto-scroll)"]
        BP -->|WS /ws/stream/:roomId?lang=...| OBS["📺 OBS Studio / vMix Overlays\n(Transparent BG, Broadcast Typography)"]
        BP -->|On-Demand HTTP GET| EXP["💾 Subtitle Exporters\n(SRT, WebVTT, TXT - Strict UTF-8)"]
    end
```

### Resumen del Flujo de Datos

```
[Audio Source: Mic/File/OBS]
       │ (16kHz 16-bit PCM chunks, ~200ms)
       ▼
[WebSocket Ingest Handler] ──(Security: 64 KB limit, WS 1009 guard)
       │
       ▼
[AudioNormalizer + RingBuffer] ──(Silence Truncation & Level Metering)
       │
       ▼
[TranscriptionProvider] ──(Inference via Gemini Live Bidi or Gemma 2 Edge)
       │
       ▼
[PubSubBroker (Redis / In-Memory)] ──(Channel: loce:room:{roomId})
       │
       ├──> [Smart Backpressure Queue] ──> [Audience View: EN, ES, PT, FR, DE, IT, RU, ZH]
       ├──> [Smart Backpressure Queue] ──> [OBS Overlay: Native Transparent Browser Source]
       └──> [Synchronized Timecodes]   ──> [Exporters: SubRip .srt / WebVTT .vtt / .txt]
```

---

## ⚡ Motores de Inferencia Híbridos: Cloud vs. Edge

LOCE permite alternar en tiempo de ejecución o por configuración de entorno entre inferencia de vanguardia en la nube y ejecución soberana 100% on-premise:

| Capacidad | ⚡ Google Gemini Live API | 🔒 Gemma 2 On-Premise (Edge) | 🧪 Mock Simulation Engine |
| :--- | :--- | :--- | :--- |
| **Entorno de Ejecución** | Google Cloud AI Hypercomputer | Servidor Local / GPU Edge / Air-Gapped | En memoria local / Offline CI/CD |
| **Soberanía y Privacidad** | Conexión saliente cifrada TLS | **100% On-Premise (Zero Data Egress)** | Totalmente sintético |
| **Protocolo de Inferencia** | WebSocket `BidiGenerateContent` | Streaming Token-by-Token (Ollama / vLLM) | Async loop determinístico |
| **Modelo Recomendado** | `models/gemini-3.5-transcribe-live` | `gemma2:2b` / `gemma:2b` | Script pre-compilado de conferencia |
| **Idiomas Simultáneos** | 8 (EN, ES, PT, FR, DE, IT, RU, ZH) | 8 (EN, ES, PT, FR, DE, IT, RU, ZH) | 8 (EN, ES, PT, FR, DE, IT, RU, ZH) |
| **Glosario Técnico** | Inyección en System Instructions | Inyección en System Prompt de Gemma | Mapeo por diccionario de regex |
| **Requisitos Hardware** | `GEMINI_API_KEY` (sin GPU local) | GPU NVIDIA / Apple Silicon / CPU AVX2 | Cero dependencias externas |

---

## 🚀 Benchmark Real de Concurrencia Extrema (32 Salas, 192 WebSockets)

LOCE fue sometido a una prueba de estrés masiva emulando la escala completa de **Nerdearla** (32 escenarios en paralelo) con el arnés automatizado [`scripts/stress_test.py`](scripts/stress_test.py):

- **Parámetros**: 32 salas simultáneas (`stage-1` a `stage-32`), 12.0s de audio por sala, 5 idiomas receptores activos por sala (ES, EN, PT, ZH, RU).
- **Concurrencia**: 32 streams de ingesta PCM + 160 clientes de visualización = **192 conexiones WebSocket activas simultáneas**.

```text
================================================================================================
📊 MULTI-STAGE CONCURRENT PERFORMANCE MATRIX (32 PARALLEL STAGES)
================================================================================================
STAGE      | AUDIO (KB) | PARTIALS     | FINALS     | P50 (ms)  | P95 (ms)  | STATUS  
------------------------------------------------------------------------------------------------
stage-1    |    375.0KB |           85 |         20 |    4.39ms |    8.10ms | ✅ PASS  
stage-2    |    375.0KB |           85 |         20 |    5.26ms |    7.09ms | ✅ PASS  
stage-3    |    375.0KB |           85 |         20 |    5.17ms |    6.90ms | ✅ PASS  
stage-4    |    375.0KB |           85 |         20 |    5.26ms |    6.90ms | ✅ PASS  
stage-5    |    375.0KB |           85 |         20 |    5.19ms |    6.78ms | ✅ PASS  
stage-6    |    375.0KB |           85 |         20 |    5.25ms |   10.40ms | ✅ PASS  
stage-7    |    375.0KB |           85 |         20 |    5.50ms |   11.92ms | ✅ PASS  
stage-8    |    375.0KB |           85 |         20 |    5.63ms |    8.22ms | ✅ PASS  
stage-9    |    375.0KB |           85 |         20 |    5.44ms |    8.34ms | ✅ PASS  
stage-10   |    375.0KB |           85 |         20 |    5.34ms |    8.08ms | ✅ PASS  
stage-11   |    375.0KB |           85 |         20 |    5.19ms |   10.07ms | ✅ PASS  
stage-12   |    375.0KB |           85 |         20 |    5.12ms |   10.12ms | ✅ PASS  
stage-13   |    375.0KB |           85 |         20 |    5.32ms |    6.78ms | ✅ PASS  
stage-14   |    375.0KB |           85 |         20 |    5.17ms |   11.10ms | ✅ PASS  
stage-15   |    375.0KB |           85 |         20 |    5.34ms |   11.51ms | ✅ PASS  
stage-16   |    375.0KB |           85 |         20 |    5.66ms |    9.03ms | ✅ PASS  
stage-17   |    375.0KB |           85 |         20 |    4.35ms |   10.52ms | ✅ PASS  
stage-18   |    375.0KB |           85 |         20 |    5.23ms |   12.81ms | ✅ PASS  
stage-19   |    375.0KB |           85 |         20 |    5.28ms |   10.93ms | ✅ PASS  
stage-20   |    375.0KB |           85 |         20 |    5.44ms |   12.06ms | ✅ PASS  
stage-21   |    375.0KB |           85 |         20 |    5.32ms |   12.64ms | ✅ PASS  
stage-22   |    375.0KB |           85 |         20 |    5.09ms |   12.28ms | ✅ PASS  
stage-23   |    375.0KB |           85 |         20 |    5.24ms |   10.70ms | ✅ PASS  
stage-24   |    375.0KB |           85 |         20 |    5.36ms |   11.14ms | ✅ PASS  
stage-25   |    375.0KB |           85 |         20 |    5.21ms |   11.22ms | ✅ PASS  
stage-26   |    375.0KB |           85 |         20 |    5.08ms |   12.16ms | ✅ PASS  
stage-27   |    375.0KB |           85 |         20 |    5.40ms |   14.55ms | ✅ PASS  
stage-28   |    375.0KB |           85 |         20 |    6.17ms |   15.87ms | ✅ PASS  
stage-29   |    375.0KB |           85 |         20 |    5.38ms |    7.10ms | ✅ PASS  
stage-30   |    375.0KB |           85 |         20 |    5.21ms |   10.20ms | ✅ PASS  
stage-31   |    375.0KB |           85 |         20 |    5.05ms |   15.66ms | ✅ PASS  
stage-32   |    375.0KB |           85 |         20 |    5.39ms |    7.65ms | ✅ PASS  
------------------------------------------------------------------------------------------------
```

### Métricas Agregadas Consolidadas

| Métrica de Rendimiento | Resultado Medido en Producción | Objetivo SLA |
| :--- | :---: | :---: |
| **Salas Concurrentes Activas** | **32 escenarios** | &ge; 10 |
| **Canales WebSocket Activos** | **192 conexiones simultáneas** | &ge; 50 |
| **Throughput de Ingesta de Audio** | **803.89 KB/s** (12.0 MB transferidos) | &ge; 250 KB/s |
| **Throughput de Eventos de Subtítulos** | **225.1 eventos/segundo** (2,720 parciales, 640 finales) | &ge; 50 ev/s |
| **Latencia Extremo a Extremo (P50)** | **5.26 ms** | < 100 ms |
| **Latencia Extremo a Extremo (P95)** | **11.65 ms** | < 250 ms |
| **Latencia Extremo a Extremo (P99)** | **16.42 ms** | < 1,500 ms |
| **Tasa de Éxito de Entrega** | **100.0%** (32 de 32 salas verificadas) | 100% |

---

## 🎙️ Emisión de Audio Nativa en Navegador (Zero-Friction Ingest)

LOCE incorpora un emisor de audio profesional basado en **Web Audio API** integrado en el panel de control ([`useAudioIngest.ts`](web/src/hooks/useAudioIngest.ts) y [`AudioIngestPanel.tsx`](web/src/components/AudioIngestPanel.tsx)). No requiere software adicional ni drivers virtuales:

1. **Modo Micrófono en Vivo**:
   - Captura directa vía `navigator.mediaDevices.getUserMedia` con cancelación de eco y supresión de ruido.
   - Downsampling en cliente desde la tasa nativa (44.1kHz o 48kHz) a **Linear PCM 16-bit mono a 16,000 Hz**.
   - **VU Meter Reactivo**: Indicador RMS de 60 FPS con gradiente suave (Esmeralda &rarr; Ámbar &rarr; Carmesí).
2. **Modo Archivo de Audio (WAV / MP3 / OGG)**:
   - Carga interactiva mediante selector o drag-and-drop.
   - Decodificación con `AudioContext.decodeAudioData` y streaming a **velocidad real 1x** en bloques de 200ms (6,400 bytes).
3. **Carga en 1 Clic (Sample Talk Demo)**:
   - Botón *"Cargar Audio de Demostración"* en `/admin` para probar el flujo de subtitulado de inmediato sin requerir micrófono.

---

## 🌐 Pipeline Octalingual Simultáneo (8 Idiomas)

LOCE procesa audio en inglés o español y genera en tiempo real subtítulos en **8 idiomas simultáneos** con alineación temporal idéntica:

```
                   ┌──────────────────────────────────────┐
                   │        Audio del Orador (PCM)        │
                   └──────────────────┬───────────────────┘
                                      │
                                      ▼
                   ┌──────────────────────────────────────┐
                   │    Motor de Inferencia Multilingüe   │
                   └──────────────────┬───────────────────┘
          ┌─────────────┬─────────────┼─────────────┬─────────────┐
          ▼             ▼             ▼             ▼             ▼
     ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
     │ EN (en) │   │ ES (es) │   │ PT (pt) │   │ FR (fr) │   │ DE (de) │
     └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
          ▲             ▲             ▲             ▲             ▲
          └─────────────┴─────────────┼─────────────┴─────────────┘
                                      │
                        ┌─────────────┼─────────────┐
                        ▼             ▼             ▼
                   ┌─────────┐   ┌─────────┐   ┌─────────┐
                   │ IT (it) │   │ RU (ru) │   │ ZH (zh) │
                   └─────────┘   └─────────┘   └─────────┘
```

- **Tokenización Progresiva CJK y Cirílico**: Procesamiento especializado caracter-por-caracter para Chino (`zh`) y palabras cirílicas (`ru`), garantizando animación fluida sin saltos tipográficos.
- **Sincronización de Timecodes**: Los timestamps (`start_ms`, `end_ms`) son idénticos entre los 8 idiomas para garantizar exportaciones sincronizadas.
- **Filtrado por Idioma en Pub/Sub**: Los clientes se suscriben indicando `?lang=es`, `?lang=zh`, etc., evitando el tráfico innecesario de los demás idiomas.

---

## 🛡️ Auditoría de Seguridad, Concurrencia y Resiliencia

LOCE implementa una arquitectura defensiva probada contra vectores comunes de ataque y degradación de memoria:

1. **Protección contra Path Traversal e Inyecciones**:
   - `room_id` restringido rigurosamente mediante el regex `^[a-zA-Z0-9_-]{1,64}$` en routers REST y WebSockets. Entradas con `../`, caracteres de escape o espacios son rechazadas con **HTTP 400 Bad Request** o **WS 1008 Policy Violation**.
   - Parámetros de exportación validados contra `("srt", "vtt", "txt")` e idiomas permitidos en `SUPPORTED_LANGUAGES`.
   - Confinamiento estricto de fixtures estáticos en `/fixtures/{filename:path}` mediante `os.path.commonpath`, impidiendo cualquier escape del directorio de fixtures.
2. **Defensas contra DoS en WebSockets**:
   - Límite de tamaño de paquete de audio fijado en **64 KB** (`MAX_AUDIO_CHUNK_BYTES`). Chunks de inundación son rechazados cerrando la conexión con **WS 1009 (Message Too Big)**.
3. **Prevención de Fugas de Memoria en Broker**:
   - La desuscripción de clientes en `stream_ws.py` se ejecuta protegida por `asyncio.shield(pubsub_broker.unsubscribe(subscriber))` en el bloque `finally`, garantizando la eliminación limpia de colas huérfanas ante desconexiones forzadas.
4. **Protección de Memoria en el Navegador**:
   - Guard de tamaño máximo de **100 MB** en `useAudioIngest.ts` antes de la decodificación en memoria por parte de la Web Audio API.
5. **Aislamiento Estricto de Secretos**:
   - Verificación de no exposición de variables sensibles (`GEMINI_API_KEY`, `REDIS_URL`) en `/api/rooms` ni `/healthz`.
   - Cero ocurrencias de `dangerouslySetInnerHTML` en todo el frontend React.

---

## 📺 Integración para OBS Studio y vMix

LOCE ofrece una vista de superposición dedicada (`/overlay/:roomId`) diseñada con **fondo transparente nativo** y **tipografía broadcast de alto contraste**:

### Configuración en OBS Studio
1. En tu escena de OBS, agregá una fuente de tipo **Navegador (Browser Source)**.
2. Parámetros recomendados:
   - **URL**: `http://localhost:8000/overlay/main-stage?lang=es&theme=dark&lines=2&size=xl`
   - **Ancho (Width)**: `1920`
   - **Alto (Height)**: `1080`
   - **CSS Personalizado**: Dejar en blanco (el componente fuerza `background: transparent !important`).
   - **Apagar fuente cuando no esté visible**: Activado.

### Parámetros de la URL de Superposición

| Parámetro | Opciones Permitidas | Descripción | Ejemplo |
| :--- | :--- | :--- | :--- |
| `lang` | `en`, `es`, `pt`, `fr`, `de`, `it`, `ru`, `zh` | Idioma de los subtítulos | `lang=pt` |
| `theme` | `dark`, `light` | Contraste de tipografía y sombra | `theme=dark` |
| `lines` | `1`, `2`, `3` | Líneas visibles simultáneas | `lines=2` |
| `size` | `sm`, `md`, `lg`, `xl` | Escala tipográfica broadcast | `size=xl` |

---

## 🚦 Guía Rápida de Puesta en Marcha (Quickstart)

### Opción 1: Docker Compose (1 Solo Comando)

```bash
docker compose up --build
```
El servidor LOCE compilará el frontend y el backend, levantando el servicio en `http://localhost:8000`.

---

### Opción 2: Instalación Local

#### 1. Clonar y Configurar Entorno Python
```bash
git clone https://github.com/maximolopezchenlo-lab/loce-engine.git
cd loce-engine

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

#### 2. Seleccionar Modo de Inferencia en `.env`

**Modo 100% Local Air-Gapped (Gemma 2 via Ollama):**
```bash
# Iniciar modelo local
ollama run gemma2:2b

# Configurar en .env
DEFAULT_PROVIDER=gemma
GEMMA_BASE_URL=http://localhost:11434
GEMMA_MODEL=gemma2:2b
```

**Modo Cloud (Google Gemini Live API):**
```bash
# Configurar en .env
DEFAULT_PROVIDER=gemini
GEMINI_API_KEY=tu_api_key_de_gemini
```

**Modo Simulación Sintética (Zero-Config / Offline):**
```bash
DEFAULT_PROVIDER=mock
```

#### 3. Compilar Frontend Web
```bash
cd web
npm install
npm run build
cd ..
```

#### 4. Ejecutar Suite de Tests
```bash
pytest -v
```

#### 5. Iniciar Servidor LOCE
```bash
uvicorn server.main:app --host 0.0.0.0 --port 8000
```

- **Vista de Audiencia**: `http://localhost:8000/`
- **Panel NOC de Administración**: `http://localhost:8000/admin`
- **OBS Overlay (Español)**: `http://localhost:8000/overlay/main-stage?lang=es`
- **OBS Overlay (Chino)**: `http://localhost:8000/overlay/main-stage?lang=zh`
- **API Swagger / OpenAPI**: `http://localhost:8000/docs`

---

## 🔬 Reproducción del Benchmark de Estrés

Para reproducir el benchmark de 32 salas concurrentes durante 12 segundos:

```bash
python scripts/stress_test.py --rooms 32 --duration 12.0 --langs es,en,pt,zh,ru
```

---

## 📁 Estructura del Repositorio

```text
├── core/
│   ├── ingestion/         # Normalización PCM 16kHz, ring buffer y remuestreo
│   ├── engine/            # GeminiLiveProvider, GemmaLocalProvider, MockStreamingProvider
│   ├── glossary/          # Glosario técnico y reemplazos regex en vuelo
│   └── exporters/         # Exportadores SRT, WebVTT y TXT en UTF-8 estricto
├── server/
│   ├── routers/           # WebSockets (ingest, stream), REST (rooms, export, sse)
│   ├── services/          # Orquestador de salas y ciclo de vida de sesiones
│   └── pubsub/            # Broker Redis Pub/Sub distribuido con fallback In-Memory
├── web/                   # Frontend React 19 + TypeScript + Vite + Tailwind CSS
│   ├── src/components/    # AudienceView, ObsOverlay, AdminDashboard, AudioIngestPanel
│   └── src/hooks/         # useCaptionStream, useAudioIngest (Web Audio API)
├── fixtures/              # Audios de prueba PCM 16kHz (sample_talk.wav)
├── scripts/               # Harness de benchmark de estrés y runner de simulación
├── tests/                 # Suite de tests unitarios, integración y seguridad (pytest)
├── docker/                # Dockerfile multi-stage y docker-compose.yml
├── docker-compose.yml     # Orquestación de 1 comando
├── LICENSE                # Licencia Apache 2.0
└── README.md              # Documentación técnica completa
```

---

## 📄 Licencia

Publicado bajo la licencia de código abierto [Apache 2.0](LICENSE).
