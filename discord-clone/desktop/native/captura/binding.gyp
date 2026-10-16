{
  "targets": [
    {
      "target_name": "captura",
      "sources": ["captura.cc"],
      "libraries": ["d3d11.lib", "dxgi.lib", "runtimeobject.lib", "ole32.lib", "user32.lib"],
      "msvs_settings": {
        "VCCLCompilerTool": { "AdditionalOptions": ["/guard:cf"] },
        "VCLinkerTool": { "AdditionalOptions": ["/guard:cf"] }
      }
    }
  ]
}
