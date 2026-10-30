// Ajuste da captura de tela do Windows para o Chromium do app (Electron 44, Chromium 152).
//
// O Chromium do app captura telas e janelas pelo Windows Graphics Capture (WGC). No Windows 11 24H2, o
// WGC só entrega um quadro novo depois do MinUpdateInterval da sessão (16 ms por padrão) e sempre num
// vsync: num monitor de 144 Hz isso dá 1 quadro a cada 3 vsyncs, 48 fps, por mais leve que esteja o
// resto. O Chromium não mexe nesse valor (crbug.com/565075148). Este módulo troca entradas das vtables
// do WGC e do D3D11, só dentro do processo do app (é nele que o Chromium captura):
// - IGraphicsCaptureSession::StartCapture: antes de começar, baixa o MinUpdateInterval para 8 ms, o que
//   dá pelo menos 60 quadros por segundo em qualquer monitor de 60 Hz ou mais. Um valor menor, que o
//   Chromium venha a definir, fica como está;
// - IDirect3D11CaptureFramePool::TryGetNextFrame: o Chromium busca um quadro por vez e recebe o mais
//   velho da fila. Com mais quadros chegando do que ele busca, a fila enche e a imagem atrasa. Aqui ele
//   recebe sempre o mais novo, e os mais velhos são fechados (o buffer volta para o WGC).
// - Anel de leitura (ID3D11DeviceContext::CopySubresourceRegion, Map e Unmap, e o tamanho da fila do
//   WGC): a cada quadro o Chromium copia a imagem para uma textura legível pelo processador e espera a
//   placa terminar a cópia (Map). Com um jogo enchendo a placa, essa espera foi de 12 a 37 ms, e o
//   Chromium ainda dobra o intervalo da captura por causa dela (só usa metade do tempo): a transmissão
//   caía para 21–32 fps (jogo a ~110 fps) e 10–17 fps (jogo pesado). Quando a espera passa a custar
//   quadros, o anel entra: cada cópia vai para uma textura de um anel e o Map lê a do quadro anterior,
//   que a placa já terminou, em troca de um quadro de idade na imagem. Com a placa folgada ele sai e
//   tudo fica como antes. A textura do próprio Chromium é uma das posições do anel, então um Map que
//   escape da troca lê um dos últimos quadros, nunca um mais velho do que já saiu. (Copiar também para
//   ela a cada quadro, como garantia, custou metade do ganho.)
// Medido num monitor de 144 Hz: o Movimento (que pede 64 fps à captura) foi de 48 para 59 fps, e nos
// perfis de 30 fps a imagem chega 38 ms mais nova (docs/relatorios/CAPTURA-60FPS-2026-10-16.md).
// Precisa ser código compilado (e não koffi, como o lib/foreground.js) porque as trocas rodam na
// thread de captura do Chromium, a cada quadro.
#include <windows.h>
#include <d3d11.h>
#include <dxgi.h>
#include <roapi.h>
#include <wrl/client.h>
#include <wrl/wrappers/corewrappers.h>
#include <windows.foundation.h>
#include <windows.graphics.capture.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <node_api.h>

#include <atomic>
#include <mutex>

namespace {

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Wrappers::HStringReference;
namespace WGC = ABI::Windows::Graphics::Capture;
namespace WF = ABI::Windows::Foundation;
namespace D3D = ABI::Windows::Graphics::DirectX::Direct3D11;
using PixelFormat = ABI::Windows::Graphics::DirectX::DirectXPixelFormat;
using Size32 = ABI::Windows::Graphics::SizeInt32;

// IGraphicsCaptureSession5 (Windows 11 24H2, SDK 10.0.26100), declarada aqui porque o SDK do build
// (10.0.22621) ainda não tem. A ordem dos métodos é a do metadado do Windows.
MIDL_INTERFACE("67c0ea62-1f85-5061-925a-239be0ac09cb")
SessionUpdateInterval : public IInspectable {
 public:
  virtual HRESULT STDMETHODCALLTYPE get_MinUpdateInterval(WF::TimeSpan* value) = 0;
  virtual HRESULT STDMETHODCALLTYPE put_MinUpdateInterval(WF::TimeSpan value) = 0;
};

using StartCaptureFn = HRESULT(STDMETHODCALLTYPE*)(WGC::IGraphicsCaptureSession* self);
using TryGetNextFrameFn = HRESULT(STDMETHODCALLTYPE*)(WGC::IDirect3D11CaptureFramePool* self, WGC::IDirect3D11CaptureFrame** result);
using RecreateFn = HRESULT(STDMETHODCALLTYPE*)(WGC::IDirect3D11CaptureFramePool* self, D3D::IDirect3DDevice* device, PixelFormat format, INT32 buffers, Size32 size);
using CreateFreeThreadedFn = HRESULT(STDMETHODCALLTYPE*)(WGC::IDirect3D11CaptureFramePoolStatics2* self, D3D::IDirect3DDevice* device, PixelFormat format, INT32 buffers, Size32 size, WGC::IDirect3D11CaptureFramePool** result);
using MapFn = HRESULT(STDMETHODCALLTYPE*)(ID3D11DeviceContext* self, ID3D11Resource* resource, UINT sub, D3D11_MAP type, UINT flags, D3D11_MAPPED_SUBRESOURCE* out);
using UnmapFn = void(STDMETHODCALLTYPE*)(ID3D11DeviceContext* self, ID3D11Resource* resource, UINT sub);
using CopyRegionFn = void(STDMETHODCALLTYPE*)(ID3D11DeviceContext* self, ID3D11Resource* dst, UINT dstSub, UINT x, UINT y, UINT z, ID3D11Resource* src, UINT srcSub, const D3D11_BOX* box);

// Posições nas vtables, depois dos 6 métodos de IUnknown e IInspectable.
constexpr int kStartCaptureSlot = 6;        // IGraphicsCaptureSession: StartCapture
constexpr int kRecreateSlot = 6;            // IDirect3D11CaptureFramePool: Recreate, TryGetNextFrame
constexpr int kTryGetNextFrameSlot = 7;
constexpr int kCreateFreeThreadedSlot = 6;  // IDirect3D11CaptureFramePoolStatics2
// ID3D11DeviceContext, depois de IUnknown (3) e ID3D11DeviceChild (4).
constexpr int kMapSlot = 14;
constexpr int kUnmapSlot = 15;
constexpr int kCopyRegionSlot = 46;

StartCaptureFn g_start = nullptr;
TryGetNextFrameFn g_next = nullptr;
RecreateFn g_recreate = nullptr;
CreateFreeThreadedFn g_create = nullptr;
std::atomic<INT64> g_interval{80'000};  // em unidades de 100 ns (8 ms)
std::atomic<bool> g_drain{true};
std::atomic<int> g_ring{0};   // anel ligado (1) ou não (0); vale para as capturas que começarem
std::atomic<int> g_spare{0};  // buffers a mais na fila do WGC, além dos que o anel prende
std::atomic<long> g_sessions{0};
std::atomic<long> g_adjusted{0};
std::atomic<long> g_dropped{0};
std::atomic<INT64> g_default{-1};
// Anel: cópias feitas, quadros entregues no modo anel, entradas e saídas dele, quadros repetidos (nas
// entradas), entregas de tela parada, Maps que escaparam da troca, capturas em que o anel desistiu, e a
// espera do Map do Chromium (com ou sem anel).
std::atomic<long> g_copies{0}, g_ringFrames{0}, g_entries{0}, g_exits{0}, g_repeats{0}, g_flushes{0}, g_missed{0}, g_gaveUp{0}, g_maps{0};
std::atomic<INT64> g_mapTicks{0}, g_mapMaxTicks{0};
std::mutex g_lock;
bool g_installed = false;

INT64 Ticks() {
  LARGE_INTEGER now;
  QueryPerformanceCounter(&now);
  return now.QuadPart;
}

INT64 TicksPerSecond() {
  static const INT64 frequency = [] { LARGE_INTEGER value; QueryPerformanceFrequency(&value); return value.QuadPart; }();
  return frequency;
}

// O contexto do D3D11 do Chromium: o próprio D3D11 reescreve essas entradas da vtable (ela é gravável) a
// cada quadro, então a troca é conferida e refeita em todo TryGetNextFrame, e a função que estiver lá vira
// a original. Cada vtable diferente guarda as suas.
struct ContextHooks {
  void** vtable;
  MapFn map;
  UnmapFn unmap;
  CopyRegionFn copy;
};
constexpr int kMaxContexts = 8;
ContextHooks g_contexts[kMaxContexts] = {};
std::atomic<int> g_contextCount{0};
const ContextHooks& Hooks(ID3D11DeviceContext* self) {
  void** vtable = *reinterpret_cast<void***>(self);
  int count = g_contextCount.load();
  for (int i = 0; i < count; i++) if (g_contexts[i].vtable == vtable) return g_contexts[i];
  return g_contexts[0];
}

// Estado de cada thread de captura do Chromium (uma por captura). Nada com destrutor em thread_local: ele
// rodaria na saída da thread, dentro do loader lock, e soltar um quadro do WGC ali trava o app ao fechar.
// Por isso o anel é um ponteiro, e os quadros presos na hora em que a captura para ficam com ele.
//
// O anel tem três posições: a do último quadro entregue, a de um quadro à espera e a do mais novo. A 0 é a
// textura legível do próprio Chromium, e cada cópia vai para ela quando está livre: assim ela sempre tem o
// quadro mais novo, um à espera ou o último entregue, e um Map que escape da troca nunca lê um quadro mais
// velho do que já saiu. Dois modos:
// - direto (o de sempre): a cópia vai para a textura do Chromium e o Map espera a placa terminar;
// - anel: o Map lê a cópia do quadro anterior, que a placa já terminou, e o mais novo fica à espera.
// Entra no anel quando a captura de um quadro passa de 40% do intervalo entre eles por 3 quadros seguidos
// (com 50% o Chromium começa a dobrar o intervalo), repetindo o último quadro uma vez. Volta ao direto
// quando, em 8 testes seguidos (1 a cada 4 quadros), a cópia mais nova fica pronta em até 3 ms.
constexpr int kSlots = 3;
constexpr double kSlowShare = 0.4;
constexpr int kSlowFrames = 3;
constexpr int kProbeEvery = 4;
constexpr int kProbeMs = 3;
constexpr int kProbeOk = 8;
struct Ring {
  ComPtr<ID3D11Texture2D> tex[kSlots];
  ComPtr<WGC::IDirect3D11CaptureFrame> frame[kSlots];  // o quadro do WGC fica preso até a cópia dele ser lida ou passada
  ID3D11Texture2D* source[kSlots] = {};
  int waiting[kSlots] = {};           // posições com cópias ainda não entregues, a mais velha primeiro
  int count = 0;
  int last = -1;                      // posição com o último quadro entregue
  bool ready = false;                 // texturas criadas em volta da `staging` atual
  int depth = -1;                     // o g_ring de quando esta captura começou
  bool ring = false;                  // modo anel (senão, direto)
  int slow = 0, probes = 0, passed = 0;
  ID3D11Resource* staging = nullptr;  // a textura legível do Chromium
  int mapped = -1;                    // posição que está mapeada agora
  bool deliver = false;               // no Unmap, a posição mapeada (e as mais velhas) sai da espera
  bool flush = false;                 // o TryGetNextFrame devolveu o quadro mais novo do anel (tela parada)
  bool now = false;                   // o próximo Map entrega o mais novo
  bool timing = false;                // o próximo Map na textura do Chromium é o desta cópia
  bool gaveUp = false;
  long copies = 0, missed = 0;
  INT64 lastFrame = 0;                // quando chegou o último quadro novo
  INT64 fetchAt = 0, copyAt = 0, interval = 0;  // começo da busca do quadro, última cópia e o intervalo até ela
  ID3D11Texture2D* src = nullptr;               // textura do quadro que o TryGetNextFrame acabou de entregar
  WGC::IDirect3D11CaptureFrame* held = nullptr;  // esse quadro, com uma referência nossa
  void Hold(WGC::IDirect3D11CaptureFrame* frame) {
    if (frame) frame->AddRef();
    if (held) held->Release();
    held = frame;
  }
  bool Busy(int slot) const {
    if (ring && slot == last) return true;
    for (int i = 0; i < count; i++) if (waiting[i] == slot) return true;
    return false;
  }
  int Newest() const { return waiting[count - 1]; }
  // Tira da espera a posição `slot` e as mais velhas (a cópia dela terminou, então as de antes também), e
  // ela passa a ser a do último quadro entregue.
  void Deliver(int slot) {
    int i = 0;
    while (i < count && waiting[i] != slot) i++;
    if (i == count) return;
    for (int k = 0; k <= i; k++) { frame[waiting[k]].Reset(); source[waiting[k]] = nullptr; }
    for (int k = i + 1; k < count; k++) waiting[k - i - 1] = waiting[k];
    count -= i + 1;
    last = slot;
  }
  void Clear() {
    for (int i = 0; i < kSlots; i++) { frame[i].Reset(); source[i] = nullptr; }
    count = 0;
    last = mapped = -1;
    deliver = flush = now = ring = false;
    slow = passed = 0;
  }
  void Reset() {
    Clear();
    for (int i = 0; i < kSlots; i++) tex[i].Reset();
    ready = false;
  }
};
thread_local Ring* t_ring = nullptr;
Ring& CurrentRing() {
  if (!t_ring) t_ring = new Ring();
  return *t_ring;
}

bool Patch(void** vtable, int slot, void* hook, void** original);

HRESULT STDMETHODCALLTYPE StartCapture(WGC::IGraphicsCaptureSession* self) {
  g_sessions++;
  ComPtr<SessionUpdateInterval> session;
  if (SUCCEEDED(self->QueryInterface(IID_PPV_ARGS(&session)))) {
    WF::TimeSpan current{};
    WF::TimeSpan wanted{};
    wanted.Duration = g_interval.load();
    if (SUCCEEDED(session->get_MinUpdateInterval(&current))) {
      g_default = current.Duration;
      if (wanted.Duration > 0 && current.Duration > wanted.Duration && SUCCEEDED(session->put_MinUpdateInterval(wanted))) g_adjusted++;
    }
  }
  // O anel vale do começo ao fim de uma captura: a fila do WGC foi criada com a folga dele.
  Ring& ring = CurrentRing();
  ring.Reset();
  ring.Hold(nullptr);
  ring.src = nullptr;
  ring.staging = nullptr;
  ring.timing = false;
  ring.depth = g_ring.load();
  ring.gaveUp = false;
  ring.copies = ring.missed = 0;
  ring.probes = 0;
  ring.lastFrame = ring.fetchAt = ring.copyAt = ring.interval = 0;
  return g_start(self);
}

// Mapeia `texture` só se a cópia dela já terminou, tentando por até kProbeMs.
bool MapIfReady(ID3D11DeviceContext* self, ID3D11Resource* texture, UINT sub, D3D11_MAP type, UINT flags, D3D11_MAPPED_SUBRESOURCE* out) {
  INT64 until = Ticks() + TicksPerSecond() * kProbeMs / 1000;
  for (;;) {
    HRESULT hr = Hooks(self).map(self, texture, sub, type, flags | D3D11_MAP_FLAG_DO_NOT_WAIT, out);
    if (SUCCEEDED(hr)) return true;
    if (hr != DXGI_ERROR_WAS_STILL_DRAWING || Ticks() > until) return false;
    SwitchToThread();
  }
}

HRESULT STDMETHODCALLTYPE Map(ID3D11DeviceContext* self, ID3D11Resource* resource, UINT sub, D3D11_MAP type, UINT flags, D3D11_MAPPED_SUBRESOURCE* out) {
  Ring* current = t_ring;
  if (!current || !resource || resource != current->staging || !current->timing) return Hooks(self).map(self, resource, sub, type, flags, out);
#ifdef CAPTURA_TESTE_ESCAPE
  // Laboratório: simula o D3D11 desfazendo a troca antes do Map, a cada 7 quadros.
  static thread_local int t_calls = 0;
  if (++t_calls % 7 == 0) return Hooks(self).map(self, resource, sub, type, flags, out);
#endif
  Ring& ring = *current;
  ring.timing = false;
  INT64 start = Ticks();
  HRESULT hr = S_OK;
  int slot = -1;
  bool deliver = true, mapped = false;
  if (ring.count) {
    slot = ring.Newest();
    if (ring.ring && !ring.now) {
      // De vez em quando, testa se a cópia mais nova já fica pronta logo (a placa folgou): depois de
      // kProbeOk seguidas, volta ao direto entregando ela (a que estava à espera é passada).
      if (++ring.probes % kProbeEvery == 0) {
        mapped = MapIfReady(self, ring.tex[slot].Get(), sub, type, flags, out);
        ring.passed = mapped ? ring.passed + 1 : 0;
        if (mapped && ring.passed >= kProbeOk) {
          ring.ring = false;
          ring.passed = 0;
          g_exits++;
        } else if (mapped) {
          Hooks(self).unmap(self, ring.tex[slot].Get(), sub);
          mapped = false;
        }
      }
      if (ring.ring) {
        if (ring.count > 1) {
          slot = ring.waiting[0];
        } else if (ring.last >= 0) {
          // Acabou de entrar no anel: o único à espera é o mais novo, e o último entregue sai de novo.
          slot = ring.last;
          deliver = false;
          g_repeats++;
        }
      }
    }
    if (!mapped) hr = Hooks(self).map(self, ring.tex[slot].Get(), sub, type, flags, out);
    if (FAILED(hr)) {
      // A textura do Chromium é uma das posições: lê ela, com um dos últimos quadros.
      slot = -1;
      ring.Clear();
    } else if (ring.ring) {
      g_ringFrames++;
    }
  }
  if (slot < 0) hr = Hooks(self).map(self, resource, sub, type, flags, out);
  ring.now = false;
  INT64 spent = Ticks() - start;
  g_maps++;
  g_mapTicks += spent;
  for (INT64 max = g_mapMaxTicks.load(); spent > max && !g_mapMaxTicks.compare_exchange_weak(max, spent);) {}
  if (SUCCEEDED(hr)) {
    ring.mapped = slot;
    ring.deliver = deliver && slot >= 0;
  }
  return hr;
}

// Fecha a leitura de uma posição do anel e, se ela era entrega, tira da espera.
void FinishRead(ID3D11DeviceContext* self, Ring& ring, UINT sub) {
  int slot = ring.mapped;
  ring.mapped = -1;
  Hooks(self).unmap(self, ring.tex[slot].Get(), sub);
  if (ring.deliver) ring.Deliver(slot);
  ring.deliver = false;
}

void STDMETHODCALLTYPE Unmap(ID3D11DeviceContext* self, ID3D11Resource* resource, UINT sub) {
  Ring* current = t_ring;
  if (!current || !resource || resource != current->staging || current->mapped < 0) return Hooks(self).unmap(self, resource, sub);
  Ring& ring = *current;
  // Modo direto: a captura deste quadro (da busca até aqui, com a espera e a cópia do Chromium) passou de
  // 40% do intervalo entre quadros?
  if (!ring.ring && ring.deliver && ring.interval > 0 && ring.fetchAt) {
    ring.slow = Ticks() - ring.fetchAt > ring.interval * kSlowShare ? ring.slow + 1 : 0;
    if (ring.slow >= kSlowFrames) {
      ring.ring = true;
      ring.slow = ring.passed = 0;
      g_entries++;
    }
  }
  FinishRead(self, ring, sub);
}

void STDMETHODCALLTYPE CopyRegion(ID3D11DeviceContext* self, ID3D11Resource* dst, UINT dstSub, UINT x, UINT y, UINT z, ID3D11Resource* src, UINT srcSub, const D3D11_BOX* box) {
  Ring* current = t_ring;
  // Só a cópia que o Chromium faz do quadro que acabou de buscar; o resto passa direto.
  if (!current || !src || !current->src || src != static_cast<ID3D11Resource*>(current->src)) return Hooks(self).copy(self, dst, dstSub, x, y, z, src, srcSub, box);
  Ring& ring = *current;
  ring.src = nullptr;
  ComPtr<WGC::IDirect3D11CaptureFrame> frame;
  frame.Attach(ring.held);
  ring.held = nullptr;
  bool escaped = ring.timing;  // o Map do quadro anterior não passou por aqui
  bool flushing = ring.flush;
  ring.flush = false;
  ring.timing = true;
  if (ring.mapped >= 0) FinishRead(self, ring, 0);  // o Unmap escapou: fecha a leitura que ficou aberta
  if (dst != ring.staging) {
    // Textura nova do Chromium (começo da captura ou outro tamanho): o anel recomeça em volta dela. A
    // referência que ele guarda impede outra textura de nascer no mesmo endereço.
    ring.Reset();
    ring.staging = dst;
  }
  if (ring.depth < 0) ring.depth = g_ring.load();  // captura que começou antes da troca
  if (ring.depth <= 0 || ring.gaveUp) return Hooks(self).copy(self, dst, dstSub, x, y, z, src, srcSub, box);
  if (escaped && ring.copies) {
    // O Chromium leu a própria textura sem passar por aqui: um dos últimos quadros, nunca mais velho do
    // que já tinha saído. O anel recomeça dali; se isso for comum, desiste nesta captura e fica como era antes.
    g_missed++;
    ring.Clear();
    if (++ring.missed > 30 && ring.missed * 10 > ring.copies) {
      ring.gaveUp = true;
      ring.Reset();
      g_gaveUp++;
      return Hooks(self).copy(self, dst, dstSub, x, y, z, src, srcSub, box);
    }
  }
  if (!ring.ready) {
    ComPtr<ID3D11Texture2D> staging;
    D3D11_TEXTURE2D_DESC want{};
    ComPtr<ID3D11Device> device;
    self->GetDevice(&device);
    bool ok = SUCCEEDED(dst->QueryInterface(IID_PPV_ARGS(&staging)));
    if (ok) staging->GetDesc(&want);
    ring.tex[0] = staging;
    for (int i = 1; ok && i < kSlots; i++) ok = SUCCEEDED(device->CreateTexture2D(&want, nullptr, &ring.tex[i]));
    if (!ok) {
      ring.gaveUp = true;
      ring.Reset();
      return Hooks(self).copy(self, dst, dstSub, x, y, z, src, srcSub, box);
    }
    ring.ready = true;
  }
  ring.copies++;
  if (!flushing) {
    INT64 at = Ticks();
    ring.interval = ring.copyAt ? at - ring.copyAt : 0;
    ring.copyAt = at;
  }
  if (ring.count == kSlots - 1) {  // não deveria acontecer: a mais velha à espera é passada
    ring.frame[ring.waiting[0]].Reset();
    ring.source[ring.waiting[0]] = nullptr;
    ring.waiting[0] = ring.waiting[1];
    ring.count = 1;
  }
  int slot = 0;
  while (ring.Busy(slot)) slot++;
  Hooks(self).copy(self, ring.tex[slot].Get(), dstSub, x, y, z, src, srcSub, box);
  ring.frame[slot] = std::move(frame);
  ring.source[slot] = static_cast<ID3D11Texture2D*>(src);
  ring.waiting[ring.count++] = slot;
  g_copies++;
  // Tela parada: o Map entrega este quadro, que já devia ter saído.
  ring.now = flushing;
  if (flushing) g_flushes++;
  // No anel o Map não espera esta cópia: ela é enviada já à placa, para estar pronta no próximo quadro.
  if (ring.ring) self->Flush();
}

// Confere a vtable do contexto que o Chromium usa e troca Map, Unmap e CopySubresourceRegion que não
// estiverem trocadas.
void PatchContext(ID3D11Texture2D* texture) {
  ComPtr<ID3D11Device> device;
  texture->GetDevice(&device);
  ComPtr<ID3D11DeviceContext> context;
  device->GetImmediateContext(&context);
  void** vtable = *reinterpret_cast<void***>(context.Get());
  auto intact = [vtable] {
    return vtable[kMapSlot] == reinterpret_cast<void*>(&Map) && vtable[kUnmapSlot] == reinterpret_cast<void*>(&Unmap)
        && vtable[kCopyRegionSlot] == reinterpret_cast<void*>(&CopyRegion);
  };
  int count = g_contextCount.load();
  for (int i = 0; i < count; i++) if (g_contexts[i].vtable == vtable && intact()) return;
  std::lock_guard<std::mutex> lock(g_lock);
  count = g_contextCount.load();
  int index = 0;
  while (index < count && g_contexts[index].vtable != vtable) index++;
  if (index == kMaxContexts) return;
  ContextHooks& entry = g_contexts[index];
  entry.vtable = vtable;
  // Cada original fica guardada antes da troca da sua entrada; uma vtable nova só passa a valer depois das três.
  bool ok = Patch(vtable, kMapSlot, reinterpret_cast<void*>(&Map), reinterpret_cast<void**>(&entry.map))
      && Patch(vtable, kUnmapSlot, reinterpret_cast<void*>(&Unmap), reinterpret_cast<void**>(&entry.unmap))
      && Patch(vtable, kCopyRegionSlot, reinterpret_cast<void*>(&CopyRegion), reinterpret_cast<void**>(&entry.copy));
  if (ok && index == count) g_contextCount = count + 1;
}

ID3D11Texture2D* TextureOf(WGC::IDirect3D11CaptureFrame* frame) {
  ComPtr<D3D::IDirect3DSurface> surface;
  if (FAILED(frame->get_Surface(&surface))) return nullptr;
  ComPtr<Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess> access;
  if (FAILED(surface.As(&access))) return nullptr;
  ComPtr<ID3D11Texture2D> texture;
  if (FAILED(access->GetInterface(IID_PPV_ARGS(&texture)))) return nullptr;
  return texture.Get();  // o quadro mantém a textura viva
}

HRESULT STDMETHODCALLTYPE TryGetNextFrame(WGC::IDirect3D11CaptureFramePool* self, WGC::IDirect3D11CaptureFrame** result) {
  HRESULT hr = g_next(self, result);
  if (FAILED(hr) || !result) return hr;
  Ring& ring = CurrentRing();
  ring.fetchAt = Ticks();
  if (!*result) {
    // Tela parada há 100 ms no modo anel: devolve o quadro mais novo à espera, para ele sair. Antes disso
    // uma busca vazia é normal (um jogo a 57 fps com a captura pedindo 64).
    if (ring.ring && !ring.gaveUp && ring.count && ring.frame[ring.Newest()] && ring.fetchAt - ring.lastFrame > TicksPerSecond() / 10) {
      *result = ring.frame[ring.Newest()].Get();
      (*result)->AddRef();
      ring.Hold(*result);
      ring.src = ring.source[ring.Newest()];
      ring.flush = true;
    }
    return hr;
  }
  ring.lastFrame = ring.fetchAt;
  if (g_drain.load()) {
    for (;;) {
      WGC::IDirect3D11CaptureFrame* newer = nullptr;
      if (FAILED(g_next(self, &newer)) || !newer) break;
      ComPtr<WF::IClosable> older;
      if (SUCCEEDED((*result)->QueryInterface(IID_PPV_ARGS(&older)))) older->Close();
      (*result)->Release();
      *result = newer;
      g_dropped++;
    }
  }
  ID3D11Texture2D* texture = TextureOf(*result);
  if (texture) {
    PatchContext(texture);
    ring.src = texture;
    ring.Hold(*result);
  }
  return hr;
}

// O anel prende quadros do WGC até a cópia deles ser lida: a fila do WGC ganha essa folga e mais `g_spare`,
// porque com a placa cheia cada buffer demora para voltar preenchido.
INT32 Buffers(INT32 asked) {
  int ring = g_ring.load();
  return ring > 0 ? asked + ring + g_spare.load() : asked;
}

HRESULT STDMETHODCALLTYPE Recreate(WGC::IDirect3D11CaptureFramePool* self, D3D::IDirect3DDevice* device, PixelFormat format, INT32 buffers, Size32 size) {
  return g_recreate(self, device, format, Buffers(buffers), size);
}

HRESULT STDMETHODCALLTYPE CreateFreeThreaded(WGC::IDirect3D11CaptureFramePoolStatics2* self, D3D::IDirect3DDevice* device, PixelFormat format, INT32 buffers, Size32 size, WGC::IDirect3D11CaptureFramePool** result) {
  return g_create(self, device, format, Buffers(buffers), size, result);
}

// Troca uma entrada da vtable. O endereço original fica guardado antes da troca, porque outra thread
// pode chamar a função nova logo em seguida.
bool Patch(void** vtable, int slot, void* hook, void** original) {
  if (vtable[slot] == hook) return true;
  DWORD protection = 0;
  if (!VirtualProtect(&vtable[slot], sizeof(void*), PAGE_READWRITE, &protection)) return false;
  *original = vtable[slot];
  MemoryBarrier();
  InterlockedExchangePointer(&vtable[slot], hook);
  VirtualProtect(&vtable[slot], sizeof(void*), protection, &protection);
  return true;
}

struct Result {
  bool ok;
  const char* reason;
  int step;
  HRESULT hr;
};

Result Failure(int step, HRESULT hr) { return {false, "falhou", step, hr}; }

// Cria uma sessão de captura do monitor principal sem iniciá-la (nada aparece na tela), só para achar
// as vtables que o Chromium também usa, e troca as entradas do WGC. As do D3D11 são trocadas na primeira
// captura, no contexto que o Chromium usa.
Result Install() {
  std::lock_guard<std::mutex> lock(g_lock);
  if (g_installed) return {true, nullptr, 0, S_OK};
  // O processo principal do Electron já iniciou o COM; o Node (testes) não.
  CO_MTA_USAGE_COOKIE cookie{};
  CoIncrementMTAUsage(&cookie);
  ComPtr<ID3D11Device> d3d;
  HRESULT hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0,
                                 D3D11_SDK_VERSION, &d3d, nullptr, nullptr);
  // Sem placa de vídeo disponível, o dispositivo em software basta para achar as vtables.
  if (FAILED(hr)) hr = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0,
                                         D3D11_SDK_VERSION, &d3d, nullptr, nullptr);
  if (FAILED(hr)) return Failure(1, hr);
  ComPtr<IDXGIDevice> dxgi;
  if (FAILED(hr = d3d.As(&dxgi))) return Failure(2, hr);
  ComPtr<IInspectable> inspectable;
  if (FAILED(hr = CreateDirect3D11DeviceFromDXGIDevice(dxgi.Get(), &inspectable))) return Failure(3, hr);
  ComPtr<D3D::IDirect3DDevice> device;
  if (FAILED(hr = inspectable.As(&device))) return Failure(4, hr);
  ComPtr<IGraphicsCaptureItemInterop> interop;
  if (FAILED(hr = RoGetActivationFactory(HStringReference(RuntimeClass_Windows_Graphics_Capture_GraphicsCaptureItem).Get(),
                                         IID_PPV_ARGS(&interop)))) return Failure(5, hr);
  ComPtr<WGC::IGraphicsCaptureItem> item;
  if (FAILED(hr = interop->CreateForMonitor(MonitorFromPoint(POINT{0, 0}, MONITOR_DEFAULTTOPRIMARY), IID_PPV_ARGS(&item)))) return Failure(6, hr);
  ComPtr<WGC::IDirect3D11CaptureFramePoolStatics2> statics;
  if (FAILED(hr = RoGetActivationFactory(HStringReference(RuntimeClass_Windows_Graphics_Capture_Direct3D11CaptureFramePool).Get(),
                                         IID_PPV_ARGS(&statics)))) return Failure(7, hr);
  ComPtr<WGC::IDirect3D11CaptureFramePool> pool;
  Size32 size{64, 64};
  if (FAILED(hr = statics->CreateFreeThreaded(device.Get(), ABI::Windows::Graphics::DirectX::DirectXPixelFormat_B8G8R8A8UIntNormalized,
                                              1, size, &pool))) return Failure(8, hr);
  ComPtr<WGC::IGraphicsCaptureSession> session;
  if (FAILED(hr = pool->CreateCaptureSession(item.Get(), &session))) return Failure(9, hr);
  ComPtr<WF::IClosable> closable;
  // Antes do 24H2 não existe MinUpdateInterval: nada é trocado.
  ComPtr<SessionUpdateInterval> interval;
  bool supported = SUCCEEDED(session.As(&interval));
  bool patched = supported
      && Patch(*reinterpret_cast<void***>(session.Get()), kStartCaptureSlot, reinterpret_cast<void*>(&StartCapture), reinterpret_cast<void**>(&g_start))
      && Patch(*reinterpret_cast<void***>(pool.Get()), kTryGetNextFrameSlot, reinterpret_cast<void*>(&TryGetNextFrame), reinterpret_cast<void**>(&g_next))
      && Patch(*reinterpret_cast<void***>(pool.Get()), kRecreateSlot, reinterpret_cast<void*>(&Recreate), reinterpret_cast<void**>(&g_recreate))
      && Patch(*reinterpret_cast<void***>(statics.Get()), kCreateFreeThreadedSlot, reinterpret_cast<void*>(&CreateFreeThreaded), reinterpret_cast<void**>(&g_create));
  if (SUCCEEDED(session.As(&closable))) closable->Close();
  if (SUCCEEDED(pool.As(&closable))) closable->Close();
  if (!supported) return {false, "sem suporte", 0, S_OK};
  if (!patched) return Failure(10, HRESULT_FROM_WIN32(GetLastError()));
  g_installed = true;
  return {true, nullptr, 0, S_OK};
}

void Set(napi_env env, napi_value object, const char* name, napi_value value) { napi_set_named_property(env, object, name, value); }
napi_value Bool(napi_env env, bool value) { napi_value result; napi_get_boolean(env, value, &result); return result; }
napi_value Number(napi_env env, double value) { napi_value result; napi_create_double(env, value, &result); return result; }
napi_value Text(napi_env env, const char* value) { napi_value result; napi_create_string_utf8(env, value, NAPI_AUTO_LENGTH, &result); return result; }

// install({ intervalMs = 8, drain = true, anel = 0, folga = 0 }) → { ok, reason?, step?, hr? }. Pode ser
// chamada de novo para trocar as opções; o anel e a folga valem para as capturas que começarem depois.
napi_value InstallJs(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value options = nullptr;
  napi_get_cb_info(env, info, &argc, &options, nullptr, nullptr);
  napi_valuetype type = napi_undefined;
  if (argc && napi_typeof(env, options, &type) == napi_ok && type == napi_object) {
    napi_value value;
    double number = 0;
    bool drain = true;
    if (napi_get_named_property(env, options, "intervalMs", &value) == napi_ok && napi_get_value_double(env, value, &number) == napi_ok && number > 0 && number <= 1000) {
      g_interval = static_cast<INT64>(number * 10'000);
    }
    if (napi_get_named_property(env, options, "drain", &value) == napi_ok && napi_get_value_bool(env, value, &drain) == napi_ok) g_drain = drain;
    if (napi_get_named_property(env, options, "anel", &value) == napi_ok && napi_get_value_double(env, value, &number) == napi_ok && (number == 0 || number == 1)) g_ring = static_cast<int>(number);
    if (napi_get_named_property(env, options, "folga", &value) == napi_ok && napi_get_value_double(env, value, &number) == napi_ok && number >= 0 && number <= 8) g_spare = static_cast<int>(number);
  }
  Result result = Install();
  napi_value object;
  napi_create_object(env, &object);
  Set(env, object, "ok", Bool(env, result.ok));
  if (result.reason) Set(env, object, "reason", Text(env, result.reason));
  if (result.step) {
    Set(env, object, "step", Number(env, result.step));
    Set(env, object, "hr", Number(env, static_cast<double>(static_cast<unsigned long>(result.hr))));
  }
  return object;
}

// stats() → { installed, sessions, adjusted, dropped, defaultMs, anel, copias, noAnel, entradas, saidas,
// repetidos, telaParada, escapes, desistencias, mapMediaMs, mapMaxMs }: capturas iniciadas, quantas tiveram
// o intervalo trocado, quadros velhos descartados, o intervalo que o Windows trouxe (-1: nenhuma ainda), e
// do anel: cópias, quadros entregues no modo anel, entradas e saídas dele, quadros repetidos, entregas de
// tela parada, Maps que escaparam da troca, capturas em que ele desistiu e a espera média e máxima do Map
// do Chromium (também com o anel desligado).
napi_value StatsJs(napi_env env, napi_callback_info) {
  napi_value object;
  napi_create_object(env, &object);
  bool installed;
  { std::lock_guard<std::mutex> lock(g_lock); installed = g_installed; }
  INT64 seen = g_default.load();
  double perMs = TicksPerSecond() / 1000.0;
  long maps = g_maps.load();
  Set(env, object, "installed", Bool(env, installed));
  Set(env, object, "sessions", Number(env, g_sessions.load()));
  Set(env, object, "adjusted", Number(env, g_adjusted.load()));
  Set(env, object, "dropped", Number(env, g_dropped.load()));
  Set(env, object, "defaultMs", Number(env, seen < 0 ? -1 : seen / 10'000.0));
  Set(env, object, "anel", Number(env, g_ring.load()));
  Set(env, object, "copias", Number(env, g_copies.load()));
  Set(env, object, "noAnel", Number(env, g_ringFrames.load()));
  Set(env, object, "entradas", Number(env, g_entries.load()));
  Set(env, object, "saidas", Number(env, g_exits.load()));
  Set(env, object, "repetidos", Number(env, g_repeats.load()));
  Set(env, object, "telaParada", Number(env, g_flushes.load()));
  Set(env, object, "escapes", Number(env, g_missed.load()));
  Set(env, object, "desistencias", Number(env, g_gaveUp.load()));
  Set(env, object, "mapMediaMs", Number(env, maps ? static_cast<double>(g_mapTicks.load()) / perMs / maps : 0));
  Set(env, object, "mapMaxMs", Number(env, g_mapMaxTicks.load() / perMs));
  return object;
}

}  // namespace

NAPI_MODULE_INIT() {
  napi_property_descriptor methods[] = {
      {"install", nullptr, InstallJs, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"stats", nullptr, StatsJs, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(methods) / sizeof(methods[0]), methods);
  return exports;
}
