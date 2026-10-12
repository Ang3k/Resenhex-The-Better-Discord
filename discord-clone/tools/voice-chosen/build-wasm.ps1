param([Parameter(Mandatory=$true)][string]$EmsdkPath)
$ErrorActionPreference='Stop'
$voiceAppPath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$voiceSourcePath=Join-Path $voiceAppPath 'public/vendor/autotalent'
$env:EM_CONFIG=Join-Path $EmsdkPath '.emscripten'
& (Join-Path $EmsdkPath 'upstream/emscripten/emcc.exe') '-O2' '-fno-strict-aliasing' '-ffp-contract=off' '-I' $voiceSourcePath '-include' (Join-Path $voiceSourcePath 'zero-alloc.h') (Join-Path $voiceSourcePath 'host.c') (Join-Path $voiceSourcePath 'autotalent.c') (Join-Path $voiceSourcePath 'mayer_fft.c') '--no-entry' '-sSTANDALONE_WASM=1' '-sFILESYSTEM=0' '-sALLOW_MEMORY_GROWTH=0' '-sINITIAL_MEMORY=16777216' '-sEXPORTED_FUNCTIONS=["_at_setup","_at_new","_at_input_ptr","_at_output_ptr","_at_run","_at_latency","_at_reset","_at_release"]' '-o' (Join-Path $voiceSourcePath 'autotalent.wasm')
if($LASTEXITCODE -ne 0){throw 'Autotalent WASM compilation failed.'}
