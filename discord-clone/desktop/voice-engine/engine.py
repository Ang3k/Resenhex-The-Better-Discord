"""Local RVC/ONNX inference. Bounded binary RPC on stdin/stdout; no network/audio devices.

Packet: uint32 LE byte length, uint32 LE JSON length, JSON, float32 LE mono PCM.
Only Electron's main process starts this worker and supplies validated model paths.
"""
import json
import math
import os
import struct
import sys
import time

MAX_PACKET = 262144
RATE = 48000


def read_exact(stream, size):
    data = bytearray()
    while len(data) < size:
        part = stream.read(size - len(data))
        if not part:
            if not data:
                return None
            raise ValueError("Pacote incompleto")
        data.extend(part)
    return bytes(data)


def read_packet(stream):
    header = read_exact(stream, 4)
    if header is None:
        return None
    size = struct.unpack("<I", header)[0]
    if not 4 <= size <= MAX_PACKET:
        raise ValueError("Tamanho de pacote inválido")
    data = read_exact(stream, size)
    if data is None:
        raise ValueError("Pacote incompleto")
    meta_size = struct.unpack("<I", data[:4])[0]
    if not 0 < meta_size <= min(16384, size - 4):
        raise ValueError("Cabeçalho inválido")
    meta = json.loads(data[4:4 + meta_size])
    pcm = data[4 + meta_size:]
    if len(pcm) % 4:
        raise ValueError("PCM inválido")
    return meta, pcm


def write_packet(stream, meta, pcm=b""):
    header = json.dumps(meta, ensure_ascii=False, allow_nan=False).encode("utf-8")
    size = 4 + len(header) + len(pcm)
    if size > MAX_PACKET:
        raise ValueError("Resposta excede o limite")
    stream.write(struct.pack("<II", size, len(header)) + header + pcm)
    stream.flush()


def firwin(numtaps, cutoff, window=("kaiser", 5.0)):
    """Low-pass FIR identical to scipy.signal.firwin with a Kaiser window (unit DC gain).

    SciPy was only used for this and resample_poly; dropping it saves ~130 MB in the installer.
    """
    import numpy as np
    kind, beta = window
    if kind != "kaiser":
        raise ValueError("Only the Kaiser window is supported")
    m = np.arange(numtaps) - 0.5 * (numtaps - 1)
    h = cutoff * np.sinc(cutoff * m) * np.kaiser(numtaps, beta)
    return h / h.sum()


def resample_poly(x, up, down, window=None):
    """scipy.signal.resample_poly with zero padding (its default), as a NumPy polyphase filter."""
    import numpy as np
    divisor = math.gcd(up, down)
    up, down = up // divisor, down // divisor
    if up == down == 1:
        return x.copy()
    if window is None:
        rate = max(up, down)
        window = firwin(20 * rate + 1, 1 / rate).astype(x.dtype)
    n_in = x.shape[0]
    n_out = n_in * up // down + bool(n_in * up % down)
    h = np.array(window) * up
    half_len = (h.size - 1) // 2
    n_pre_pad = down - half_len % down
    n_pre_remove = (half_len + n_pre_pad) // down
    n_post_pad = 0
    while ((n_in - 1) * up + h.size + n_pre_pad + n_post_pad - 1) // down + 1 < n_out + n_pre_remove:
        n_post_pad += 1
    h = np.concatenate((np.zeros(n_pre_pad, h.dtype), h, np.zeros(n_post_pad, h.dtype)))
    # Upsampled convolution one phase at a time: y[q * up + r] = conv(x, h[r::up])[q].
    full = np.zeros((n_in - 1) * up + h.size, dtype=np.result_type(x, h))
    for r in range(up):
        phase = np.convolve(x, h[r::up])
        full[r::up][:phase.size] = phase
    return full[::down][n_pre_remove:n_pre_remove + n_out]


class RvcEngine:
    def __init__(self):
        from concurrent.futures import ThreadPoolExecutor
        import numpy as np
        import onnxruntime as ort
        self.np, self.ort, self.resample_poly = np, ort, resample_poly
        self.index, self.index_path, self.index_rate = None, None, 0.0
        self.firwin, self.resample_filters = firwin, {}
        # Independent sessions can run together, including DirectML. Only one
        # pitch task exists at a time; RPC and voice synthesis remain sequential.
        self.pitch_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="resenhex-pitch")
        self.parallel_inference = (os.cpu_count() or 2) >= 4
        self.pitch_threshold = np.array([0.3], np.float32)
        self.rng = np.random.default_rng()
        self.encoder = self.pitch = self.voice = None
        self.histories = {}
        self.backend = "cpu"
        self.generation = 0
        self.crossfade = np.linspace(0, 1, 960, dtype=np.float32)

    def session(self, path, backend):
        ort = self.ort
        available = ort.get_available_providers()
        providers = ["CPUExecutionProvider"]
        if backend != "cpu":
            if "DmlExecutionProvider" in available:
                providers.insert(0, "DmlExecutionProvider")
            elif "CUDAExecutionProvider" in available:
                providers.insert(0, "CUDAExecutionProvider")
            elif backend == "gpu":
                raise RuntimeError("GPU compatível não disponível; selecione Automático ou CPU")
        options = ort.SessionOptions()
        options.intra_op_num_threads = min(4, max(1, (os.cpu_count() or 2) - 1))
        options.inter_op_num_threads = 1
        # Three separate graphs share the CPU with the game. Idle thread pools must
        # sleep instead of competing with the next graph (and each other) for cores.
        options.add_session_config_entry("session.intra_op.allow_spinning", "0")
        options.add_session_config_entry("session.inter_op.allow_spinning", "0")
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.enable_mem_pattern = "DmlExecutionProvider" not in providers
        options.log_severity_level = 3
        try:
            return ort.InferenceSession(path, sess_options=options, providers=providers)
        except Exception:
            if backend != "auto" or providers == ["CPUExecutionProvider"]:
                raise
            options.enable_mem_pattern = True
            return ort.InferenceSession(path, sess_options=options, providers=["CPUExecutionProvider"])

    def load(self, meta):
        backend = meta.get("backend", "auto")
        if backend not in ("auto", "cpu", "gpu"):
            raise ValueError("Backend inválido")
        context_ms = int(meta.get("contextMs", 480))
        if context_ms not in (320, 480, 640):
            raise ValueError("Contexto inválido")
        block_ms = int(meta.get("blockMs", 120))
        if block_ms not in (80, 120, 160):
            raise ValueError("Bloco inválido")
        # Load fully before swapping the current model. A failed switch preserves it.
        encoder_key, pitch_key = (meta["encoder"], backend), (meta["pitch"], backend)
        encoder = self.encoder if encoder_key == getattr(self, "encoder_key", None) else self.session(meta["encoder"], backend)
        pitch = self.pitch if pitch_key == getattr(self, "pitch_key", None) else self.session(meta["pitch"], backend)
        voice_key = (meta["voice"], backend)
        voice = self.voice if voice_key == getattr(self, "voice_key", None) else self.session(meta["voice"], backend)
        inputs = {item.name for item in voice.get_inputs()}
        schema = "vcclient" if {"feats", "p_len", "pitch", "pitchf", "sid"}.issubset(inputs) else "rvc" if {"phone", "phone_lengths", "pitch", "pitchf", "ds", "rnd"}.issubset(inputs) else None
        if not schema:
            raise ValueError("Modelo precisa ser RVC v1/v2 ONNX com pitch")
        metadata = voice.get_modelmeta().custom_metadata_map
        model_meta = json.loads(metadata.get("metadata", "{}"))
        sr = int(model_meta.get("samplingRate", meta.get("sampleRate", 40000)))
        if sr not in (16000, 32000, 40000, 48000):
            raise ValueError("Taxa de amostragem do modelo não suportada")
        channels = voice.get_inputs()[0].shape[-1]
        if channels not in (256, 768):
            raise ValueError("Modelo incompatível: exige características ContentVec de 256 ou 768 canais")
        decoder_guard_frames = int(model_meta.get("decoderGuardFrames", 16))
        decoder_mode = model_meta.get("decoderMode", "guarded-v1")
        if decoder_mode not in ("guarded-v1", "bounded-v1"):
            raise ValueError("Modo de síntese incompatível")
        if decoder_guard_frames != 16:
            raise ValueError("Contexto de síntese incompatível")
        warm_key = (encoder_key, pitch_key, voice_key, context_ms, block_ms)
        needs_warmup = warm_key != getattr(self, "warm_key", None)
        self.encoder, self.pitch, self.voice = encoder, pitch, voice
        self.encoder_inputs = encoder.get_inputs()
        self.voice_dtype = self.np.float16 if voice.get_inputs()[0].type == "tensor(float16)" else self.np.float32
        self.encoder_key, self.pitch_key = encoder_key, pitch_key
        self.voice_key = voice_key
        self.schema = schema
        self.channels = channels
        self.model_rate = sr
        self.streaming_decoder = "decoder_start" in inputs
        self.decoder_guard_frames = decoder_guard_frames
        self.decoder_mode = decoder_mode
        self.histories.clear()
        self.generation += 1
        self.backend = {"DmlExecutionProvider": "directml", "CUDAExecutionProvider": "cuda"}.get(voice.get_providers()[0], "cpu")
        # DirectML trava o processo (access violation) com dois grafos rodando ao mesmo tempo
        # em threads diferentes; na GPU, ContentVec e RMVPE rodam um depois do outro.
        self.parallel_inference = self.backend == "cpu" and (os.cpu_count() or 2) >= 4
        self.pitch_shift = max(-12, min(12, float(meta.get("pitchShift", 0))))
        self.load_index(meta.get("index"), meta.get("indexRate", 0))
        self.context_ms = context_ms
        self.block_ms = block_ms
        # Compile/warm each graph while the UI says Loading, before accepting microphone frames.
        # A cold GPU shader or CPU allocator must not trigger the real-time failure watchdog.
        silence = self.np.zeros(block_ms * 48, dtype="<f4").tobytes()
        try:
            for _ in range(2 if needs_warmup else 0):
                self.convert({"generation": self.generation, "stream": "warmup", "epoch": 0}, silence, force_inference=True)
            self.warm_key = warm_key
        finally:
            self.histories.clear()
        return {"backend": self.backend, "providers": voice.get_providers(), "sampleRate": sr, "generation": self.generation}

    def load_index(self, path, rate):
        """Retrieval index: representative ContentVec frames of the character (N x 768, fp16 on disk)."""
        np = self.np
        self.index_rate = max(0.0, min(1.0, float(rate or 0)))
        if not path:
            self.index, self.index_path = None, None
            return
        if path != getattr(self, "index_path", None):
            vectors = np.load(path, allow_pickle=False)
            if vectors.ndim != 2 or vectors.shape[1] != self.channels or not len(vectors):
                raise ValueError("Índice de voz incompatível com o modelo")
            self.index = np.ascontiguousarray(vectors, dtype=np.float32)
            self.index_norms = np.einsum("ij,ij->i", self.index, self.index)
            self.index_path = path

    def retrieve(self, feats):
        """RVC index blending: each frame moves towards its 8 nearest character frames (inverse-square weights)."""
        np = self.np
        if self.index is None or self.index_rate <= 0:
            return feats
        frames = feats[0].astype(np.float32, copy=False)
        distances = np.einsum("ij,ij->i", frames, frames)[:, None] - 2 * frames @ self.index.T + self.index_norms[None]
        k = min(8, len(self.index))
        nearest = np.argpartition(distances, k - 1, axis=1)[:, :k]
        score = np.maximum(np.take_along_axis(distances, nearest, axis=1), 1e-8)
        weight = np.square(1 / score)
        weight /= weight.sum(axis=1, keepdims=True)
        blended = np.einsum("tk,tkc->tc", weight, self.index[nearest])
        return (blended * self.index_rate + frames * (1 - self.index_rate))[None].astype(feats.dtype, copy=False)

    def resample(self, audio, source, target):
        if source == target:
            return audio.astype(self.np.float32, copy=False)
        divisor = math.gcd(source, target)
        up, down = target // divisor, source // divisor
        key = (up, down, audio.dtype.str)
        if key not in self.resample_filters:
            # Exactly SciPy's default Kaiser FIR, designed once per ratio. The
            # resampler copies the coefficients before scaling them internally.
            rate = max(up, down)
            self.resample_filters[key] = self.firwin(20 * rate + 1, 1 / rate, window=("kaiser", 5.0)).astype(audio.dtype)
        return self.resample_poly(audio, up, down, window=self.resample_filters[key]).astype(self.np.float32, copy=False)

    def resample_window(self, audio, offset, length):
        """Resample only the audible window, with FIR guards and an aligned phase."""
        divisor = math.gcd(self.model_rate, RATE)
        up, down = RATE // divisor, self.model_rate // divisor
        source_offset = offset * down // up
        start = max(0, (source_offset // down - 64) * down)
        stop = min(len(audio), (offset + length) * down // up + 64 * down)
        converted = self.resample(audio[start:stop], self.model_rate, RATE)
        target_offset = offset - start * up // down
        return converted[target_offset:target_offset + length]

    def convert(self, meta, pcm, force_inference=False):
        np = self.np
        if self.voice is None:
            raise RuntimeError("Escolha e carregue uma voz antes de converter")
        if meta.get("generation") != self.generation:
            raise ValueError("Modelo mudou; descarte este bloco")
        samples = np.frombuffer(pcm, dtype="<f4")
        if len(samples) not in (3840, 5760, 7680) or not np.isfinite(samples).all():
            raise ValueError("Bloco precisa conter 80, 120 ou 160 ms de áudio mono a 48 kHz")
        if len(samples) != getattr(self, "block_ms", len(samples) // 48) * 48:
            raise ValueError("Bloco não corresponde ao perfil carregado")
        stream = str(meta.get("stream", ""))
        if not stream or len(stream) > 80:
            raise ValueError("Sessão de áudio inválida")
        if stream not in self.histories and len(self.histories) >= 2:
            raise RuntimeError("Limite de sessões de áudio atingido")
        started = time.perf_counter()
        epoch = int(meta.get("epoch", 0))
        previous = self.histories.get(stream)
        context_size = self.context_ms * 16
        if previous is None or previous["epoch"] != epoch:
            previous = {"epoch": epoch, "input": np.zeros(context_size, np.float32), "tail": None}
        incoming = self.resample(np.clip(samples, -1, 1), RATE, 16000)
        history = np.concatenate((previous["input"], incoming))
        # Wait for the complete context to become quiet, so word endings and the
        # vocoder tail are never cut just because the current microphone block is quiet.
        if not force_inference and np.max(np.abs(history)) <= 1e-4:
            self.histories[stream] = {"epoch": epoch, "input": history[-context_size:].copy(), "tail": None}
            elapsed = (time.perf_counter() - started) * 1000
            return {"inferenceMs": elapsed, "rtf": elapsed / (len(samples) / 48), "backend": self.backend,
                    "generation": self.generation, "silent": True}, np.zeros(len(samples), dtype="<f4").tobytes()
        # A short reflected right edge supports the vocoder; this is context, not an unbounded queue.
        audio = np.pad(history, (0, 640), mode="reflect")
        prepared = time.perf_counter()
        encoder_inputs = self.encoder_inputs
        feed = {}
        for item in encoder_inputs:
            if item.name in ("audio", "source", "waveform", "input", "wav"):
                source = audio[None, None] if len(item.shape) == 3 else audio[None]
                feed[item.name] = source.astype(np.float16 if item.type == "tensor(float16)" else np.float32, copy=False)
            elif item.name in ("padding_mask", "mask"):
                feed[item.name] = np.zeros((1, len(audio)), dtype=bool)
            else:
                raise ValueError("Entrada de ContentVec desconhecida: " + item.name)
        pitch_feed = {"waveform": audio[None], "threshold": self.pitch_threshold}
        pitch_task = self.pitch_pool.submit(self.pitch.run, None, pitch_feed) if self.parallel_inference else None
        try:
            features = self.encoder.run(None, feed)
        except BaseException:
            # Drain the other session before accepting a model switch or RPC.
            # Preserve the encoder error even if both sessions fail.
            if pitch_task is not None:
                try:
                    pitch_task.result()
                except Exception:
                    pass
            raise
        pitchf = (pitch_task.result() if pitch_task is not None else self.pitch.run(None, pitch_feed))[0].reshape(-1)
        pitched = time.perf_counter()
        feats = next((item for item in features if item.ndim == 3 and item.shape[-1] == self.channels), None)
        if feats is None:
            raise ValueError("ContentVec não retornou as características do modelo")
        feats = self.retrieve(feats)
        feats = np.repeat(feats, 2, axis=1)
        frames = min(feats.shape[1], len(audio) // 160)
        feats = feats[:, :frames]
        if len(pitchf) < frames:
            pitchf = np.pad(pitchf, (0, frames - len(pitchf)))
        pitchf = pitchf[:frames] * (2 ** (self.pitch_shift / 12))
        mel = 1127 * np.log1p(pitchf / 700)
        low, high = 1127 * np.log1p(50 / 700), 1127 * np.log1p(1100 / 700)
        coarse = np.rint(np.clip(np.where(mel > 0, (mel - low) * 254 / (high - low) + 1, 1), 1, 255)).astype(np.int64)
        # Keep linguistic context in the voice model's attention layers as well as ContentVec.
        # Truncating it before synthesis harmed Portuguese articulation in the comparison test.
        feed = {"feats": feats.astype(self.voice_dtype, copy=False), "p_len": np.array([frames], np.int64), "pitch": coarse[None], "pitchf": pitchf[None].astype(np.float32, copy=False), "sid": np.array([0], np.int64)}
        decoder_start = self.context_ms // 10 if self.streaming_decoder and self.decoder_mode == "bounded-v1" else max(0, self.context_ms // 10 - self.decoder_guard_frames) if self.streaming_decoder else 0
        if self.streaming_decoder:
            feed["decoder_start"] = np.array([decoder_start], np.int64)
        if self.schema == "rvc":
            feed = {"phone": feed["feats"], "phone_lengths": feed["p_len"], "pitch": feed["pitch"], "pitchf": feed["pitchf"], "ds": feed["sid"], "rnd": (self.rng.standard_normal((1, 192, frames)) * .66666).astype(np.float32)}
        converted = self.voice.run(None, feed)[0].reshape(-1)
        synthesized = time.perf_counter()
        offset = (self.context_ms - decoder_start * 10) * 48
        required = len(samples) + 960
        segment = self.resample_window(converted, offset, required)
        if len(segment) < len(samples):
            raise RuntimeError("Modelo retornou áudio insuficiente")
        # SOLA phase alignment, as used by real-time RVC clients. Bound the search to 10 ms.
        # This avoids cancellation/clicks when the vocoder restarts its oscillator each block.
        if previous["tail"] is not None:
            count = min(960, len(previous["tail"]))
            search = min(480, len(segment) - len(samples))
            if count and search > 0:
                reference = previous["tail"][:count]
                energy = float(np.dot(reference, reference))
                if energy > 1e-6:
                    window = segment[:count + search]
                    correlation = np.correlate(window, reference, mode="valid")
                    cumulative = np.concatenate(([0.0], np.cumsum(window * window, dtype=np.float64)))
                    norm = np.sqrt(np.maximum((cumulative[count:] - cumulative[:-count]) * energy, 1e-8))
                    shift = int(np.argmax(correlation / norm))
                    segment = segment[shift:]
        output = segment[:len(samples)].copy()
        if previous["tail"] is not None:
            count = min(960, len(previous["tail"]), len(output))
            ramp = self.crossfade[:count] if count == 960 else np.linspace(0, 1, count, dtype=np.float32)
            output[:count] = previous["tail"][:count] * (1 - ramp) + output[:count] * ramp
        # No recordings, inference logs, or audio persistence.
        self.histories[stream] = {"epoch": epoch, "input": history[-context_size:].copy(), "tail": segment[len(samples):].copy()}
        if not np.isfinite(output).all():
            raise RuntimeError("Modelo retornou áudio inválido")
        output = np.clip(output, -.95, .95).astype("<f4")
        elapsed = (time.perf_counter() - started) * 1000
        result = {"inferenceMs": elapsed, "rtf": elapsed / (len(samples) / 48), "backend": self.backend, "generation": self.generation}
        if meta.get("profile"):
            result["stagesMs"] = {"prepare": (prepared - started) * 1000, "encoderPitch": (pitched - prepared) * 1000,
                                  "synthesis": (synthesized - pitched) * 1000,
                                  "output": elapsed - (synthesized - started) * 1000}
        return result, output.tobytes()


def main():
    engine = RvcEngine()
    while True:
        packet = read_packet(sys.stdin.buffer)
        if packet is None:
            return
        meta, pcm = packet
        response = {"id": meta.get("id")}
        out = b""
        try:
            op = meta.get("op")
            if op == "status":
                response.update(providers=engine.ort.get_available_providers(), protocol=1)
            elif op == "load":
                response.update(engine.load(meta))
            elif op == "convert":
                result, out = engine.convert(meta, pcm)
                response.update(result)
            elif op == "release":
                engine.histories.pop(str(meta.get("stream", "")), None)
            else:
                raise ValueError("Operação inválida")
        except Exception as error:
            response["error"] = str(error)[:400]
        write_packet(sys.stdout.buffer, response, out)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
