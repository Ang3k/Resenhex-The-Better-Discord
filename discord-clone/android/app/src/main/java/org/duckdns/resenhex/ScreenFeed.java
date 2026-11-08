package org.duckdns.resenhex;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayDeque;

/**
 * Fila dos pacotes da transmissão de tela (vídeo e som) até o site. O site lê com um fetch() no
 * endereço /__resenhex/tela/&lt;chave&gt;, que o MainActivity responde com o fluxo daqui
 * (shouldInterceptRequest): os bytes vão direto do app para a página, sem passar pela rede.
 *
 * Cada pacote tem um cabeçalho de 16 bytes (little-endian), lido por public/android-screen.js:
 *   byte 0: tipo (TYPE_*); byte 1: marcas (FLAG_*); bytes 2-3: geração do codificador;
 *   bytes 4-7: tamanho do conteúdo; bytes 8-15: instante em microssegundos.
 *
 * Se o site parar de ler (página travada), a fila não cresce sem limite: ela se esvazia e o vídeo
 * espera o próximo quadro-chave, que o serviço pede na hora.
 */
final class ScreenFeed {
    static final int TYPE_INFO = 1;
    static final int TYPE_H264 = 2;
    static final int TYPE_JPEG = 3;
    static final int TYPE_PCM = 4;
    static final int FLAG_KEY = 1;
    static final int HEADER = 16;
    private static final int MAX_BYTES = 12 * 1024 * 1024;

    interface Listener {
        /** A fila foi esvaziada (ou um leitor novo chegou): o vídeo precisa de um quadro-chave. */
        void needKeyframe();
    }

    private final ArrayDeque<byte[]> queue = new ArrayDeque<>();
    private int queuedBytes;
    private boolean waitKey;
    private Reader reader;
    private byte[] info;
    private Listener listener;

    synchronized void setListener(Listener listener) {
        this.listener = listener;
    }

    static byte[] packet(int type, int flags, int generation, long timeUs, byte[] data, int offset, int length) {
        byte[] out = new byte[HEADER + length];
        ByteBuffer header = ByteBuffer.wrap(out, 0, HEADER).order(ByteOrder.LITTLE_ENDIAN);
        header.put((byte) type).put((byte) flags).putShort((short) generation).putInt(length).putLong(timeUs);
        System.arraycopy(data, offset, out, HEADER, length);
        return out;
    }

    /** Começo de uma transmissão: limpa o que sobrou da anterior. */
    synchronized void reset() {
        queue.clear();
        queuedBytes = 0;
        waitKey = false;
        info = null;
        if (reader != null) reader.closed = true;
        reader = null;
        notifyAll();
    }

    /** Descrição do vídeo atual (tamanho e codec): vai na fila e de novo para cada leitor novo. */
    synchronized void info(byte[] packet) {
        info = packet;
        add(packet);
    }

    /** Quadro de vídeo. Depois de um corte, só entra a partir de um quadro-chave. */
    void video(byte[] packet, boolean key) {
        boolean ask = false;
        synchronized (this) {
            if (waitKey && !key) return;
            if (key) waitKey = false;
            ask = add(packet);
        }
        if (ask) requestKeyframe();
    }

    void audio(byte[] packet) {
        boolean ask;
        synchronized (this) {
            ask = add(packet);
        }
        if (ask) requestKeyframe();
    }

    /** Põe na fila; true se ela estourou e foi esvaziada (o vídeo precisa recomeçar de um quadro-chave). */
    private boolean add(byte[] packet) {
        boolean overflow = false;
        if (queuedBytes + packet.length > MAX_BYTES) {
            queue.clear();
            queuedBytes = 0;
            waitKey = true;
            overflow = true;
            if (info != null && packet != info) {
                queue.add(info);
                queuedBytes += info.length;
            }
        }
        queue.add(packet);
        queuedBytes += packet.length;
        notifyAll();
        return overflow;
    }

    private void requestKeyframe() {
        Listener current;
        synchronized (this) {
            current = listener;
        }
        if (current != null) current.needKeyframe();
    }

    /** Leitor novo (o site abriu o fetch): substitui o anterior e começa da descrição e de um quadro-chave. */
    InputStream open() {
        Reader fresh;
        synchronized (this) {
            if (reader != null) reader.closed = true;
            queue.clear();
            queuedBytes = 0;
            waitKey = true;
            if (info != null) {
                queue.add(info);
                queuedBytes += info.length;
            }
            fresh = reader = new Reader();
            notifyAll();
        }
        requestKeyframe();
        return fresh;
    }

    /** Fim da transmissão: o leitor termina (o fetch do site acaba). */
    synchronized void close() {
        if (reader != null) reader.closed = true;
        reader = null;
        queue.clear();
        queuedBytes = 0;
        info = null;
        notifyAll();
    }

    private final class Reader extends InputStream {
        volatile boolean closed;
        private byte[] current;
        private int position;

        @Override
        public int read() throws IOException {
            byte[] one = new byte[1];
            int n = read(one, 0, 1);
            return n <= 0 ? -1 : one[0] & 0xff;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            if (length == 0) return 0;
            if (current == null || position >= current.length) {
                synchronized (ScreenFeed.this) {
                    while (!closed && queue.isEmpty()) {
                        try {
                            ScreenFeed.this.wait(1000);
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                            return -1;
                        }
                    }
                    if (closed) return -1;
                    current = queue.poll();
                    queuedBytes -= current.length;
                    position = 0;
                }
            }
            int n = Math.min(length, current.length - position);
            System.arraycopy(current, position, buffer, offset, n);
            position += n;
            return n;
        }

        @Override
        public int available() {
            return current == null ? 0 : current.length - position;
        }

        @Override
        public void close() {
            closed = true;
            synchronized (ScreenFeed.this) {
                if (reader == this) reader = null;
                ScreenFeed.this.notifyAll();
            }
        }
    }
}
