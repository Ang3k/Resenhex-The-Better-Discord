// Ajuste da captura de tela do Windows para o Chromium do app (Electron 44, Chromium 152).
//
// O Chromium do app captura telas e janelas pelo Windows Graphics Capture (WGC). No Windows 11 24H2, o
// WGC só entrega um quadro novo depois do MinUpdateInterval da sessão (16 ms por padrão) e sempre num
// vsync: num monitor de 144 Hz isso dá 1 quadro a cada 3 vsyncs, 48 fps, por mais leve que esteja o
// resto. O Chromium não mexe nesse valor (crbug.com/565075148). Este módulo troca duas entradas das
// vtables do WGC, só dentro do processo do app (é nele que o Chromium captura):
// - IGraphicsCaptureSession::StartCapture: antes de começar, baixa o MinUpdateInterval para 8 ms, o que
//   dá pelo menos 60 quadros por segundo em qualquer monitor de 60 Hz ou mais. Um valor menor, que o
//   Chromium venha a definir, fica como está;
// - IDirect3D11CaptureFramePool::TryGetNextFrame: o Chromium busca um quadro por vez e recebe o mais
//   velho da fila. Com mais quadros chegando do que ele busca, a fila enche e a imagem atrasa. Aqui ele
//   recebe sempre o mais novo, e os mais velhos são fechados (o buffer volta para o WGC).
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

// Posições nas vtables, depois dos 6 métodos de IUnknown e IInspectable.
constexpr int kStartCaptureSlot = 6;     // IGraphicsCaptureSession: StartCapture
constexpr int kTryGetNextFrameSlot = 7;  // IDirect3D11CaptureFramePool: Recreate, TryGetNextFrame

StartCaptureFn g_start = nullptr;
TryGetNextFrameFn g_next = nullptr;
std::atomic<INT64> g_interval{80'000};  // em unidades de 100 ns (8 ms)
std::atomic<bool> g_drain{true};
std::atomic<long> g_sessions{0};
std::atomic<long> g_adjusted{0};
std::atomic<long> g_dropped{0};
std::atomic<INT64> g_default{-1};
std::mutex g_lock;
bool g_installed = false;

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
  return g_start(self);
}

HRESULT STDMETHODCALLTYPE TryGetNextFrame(WGC::IDirect3D11CaptureFramePool* self, WGC::IDirect3D11CaptureFrame** result) {
  HRESULT hr = g_next(self, result);
  if (FAILED(hr) || !result || !*result || !g_drain.load()) return hr;
  for (;;) {
    WGC::IDirect3D11CaptureFrame* newer = nullptr;
    if (FAILED(g_next(self, &newer)) || !newer) break;
    ComPtr<WF::IClosable> older;
    if (SUCCEEDED((*result)->QueryInterface(IID_PPV_ARGS(&older)))) older->Close();
    (*result)->Release();
    *result = newer;
    g_dropped++;
  }
  return hr;
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
// as vtables que o Chromium também usa, e troca as duas entradas.
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
  ComPtr<ABI::Windows::Graphics::DirectX::Direct3D11::IDirect3DDevice> device;
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
  ABI::Windows::Graphics::SizeInt32 size{64, 64};
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
      && Patch(*reinterpret_cast<void***>(pool.Get()), kTryGetNextFrameSlot, reinterpret_cast<void*>(&TryGetNextFrame), reinterpret_cast<void**>(&g_next));
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

// install({ intervalMs = 8, drain = true }) → { ok, reason?, step?, hr? }. Pode ser chamada de novo
// para trocar as opções.
napi_value InstallJs(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value options = nullptr;
  napi_get_cb_info(env, info, &argc, &options, nullptr, nullptr);
  napi_valuetype type = napi_undefined;
  if (argc && napi_typeof(env, options, &type) == napi_ok && type == napi_object) {
    napi_value value;
    double ms = 0;
    bool drain = true;
    if (napi_get_named_property(env, options, "intervalMs", &value) == napi_ok && napi_get_value_double(env, value, &ms) == napi_ok && ms > 0 && ms <= 1000) {
      g_interval = static_cast<INT64>(ms * 10'000);
    }
    if (napi_get_named_property(env, options, "drain", &value) == napi_ok && napi_get_value_bool(env, value, &drain) == napi_ok) g_drain = drain;
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

// stats() → { installed, sessions, adjusted, dropped, defaultMs }: capturas iniciadas, quantas tiveram
// o intervalo trocado, quadros velhos descartados e o intervalo que o Windows trouxe (-1: nenhuma ainda).
napi_value StatsJs(napi_env env, napi_callback_info) {
  napi_value object;
  napi_create_object(env, &object);
  bool installed;
  { std::lock_guard<std::mutex> lock(g_lock); installed = g_installed; }
  INT64 seen = g_default.load();
  Set(env, object, "installed", Bool(env, installed));
  Set(env, object, "sessions", Number(env, g_sessions.load()));
  Set(env, object, "adjusted", Number(env, g_adjusted.load()));
  Set(env, object, "dropped", Number(env, g_dropped.load()));
  Set(env, object, "defaultMs", Number(env, seen < 0 ? -1 : seen / 10'000.0));
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
