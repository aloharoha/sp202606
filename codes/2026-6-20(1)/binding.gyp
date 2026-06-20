{
  "targets": [
    {
      "target_name": "physics",
      "sources": [
        "physics/physics.cpp",
        "physics/binding.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "cflags!":        ["-fno-exceptions"],
      "cflags_cc!":     ["-fno-exceptions"],
      "cflags_cc":      ["-std=c++17", "-O2"],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "AdditionalOptions": ["/std:c++17", "/O2"]
        }
      }
    }
  ]
}
