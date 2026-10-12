# Autotalent 0.2 — distribuição no cliente

Autotalent 0.2, de Thomas A. Baran, é usado em Autotune, Voz em acordes e Coral.
Fonte original: http://web.mit.edu/tbaran/www/autotalent.html

- `autotalent.c`: versão 0.2, 20 de março de 2010, GPL-2.0-or-later; texto integral em `COPYING`.
- `mayer_fft.c` e `mayer_fft.h`: FFT de Ron Mayer, adaptada no Pure Data por Miller S. Puckette. Os avisos originais foram preservados; a licença distribuída com a fonte está em `COPYING-mayer_fft`.
- `ladspa.h`: LADSPA 1.1, copyright 2000–2002 Richard W. E. Furse, Paul Barton-Davis e Stefan Westerfeld, LGPL-2.1-or-later; texto integral em `COPYING-LADSPA`.
- `host.c` e `zero-alloc.h`: adaptação de integração do Resenhex, GPL-2.0-or-later. O DSP original não foi editado. O host oferece blocos de 128 amostras, dez instâncias, relógio dos acordes e limpeza de histórico ao silenciar.

O código-fonte correspondente a `autotalent.wasm` está nesta mesma pasta e é servido junto com o binário. Não retirar as fontes ou os avisos ao distribuir o módulo. O script de compilação está em `tools/voice-chosen/build-wasm.ps1`, no repositório do app.

Compilação utilizada: Emscripten 6.0.12, `-O2 -fno-strict-aliasing -ffp-contract=off`, `zero-alloc.h` incluído antes das fontes, WASM standalone sem imports, memória fixa de 16 MiB. O script registra os demais parâmetros e exports. O SDK é uma dependência de desenvolvimento, não é necessário para executar os efeitos.
