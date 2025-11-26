{
  "targets": [
    {
      "target_name": "fn_key_monitor",
      "sources": ["src/native/fn_key_monitor.mm"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "libraries": [
        "-framework Carbon",
        "-framework CoreFoundation",
        "-framework ApplicationServices"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "OTHER_CFLAGS": ["-mmacosx-version-min=10.15"],
        "CLANG_CXX_LIBRARY": "libc++"
      },
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
    },
    {
      "target_name": "audio_capture",
      "sources": ["src/native/audio_capture.mm"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "libraries": [
        "-framework AVFoundation",
        "-framework CoreAudio",
        "-framework AudioToolbox"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "OTHER_CFLAGS": ["-mmacosx-version-min=10.15"],
        "CLANG_CXX_LIBRARY": "libc++"
      },
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
    },
    {
      "target_name": "typing_monitor",
      "sources": ["src/native/typing_monitor.mm"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "libraries": [
        "-framework Carbon",
        "-framework CoreFoundation",
        "-framework ApplicationServices",
        "-framework AppKit"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "OTHER_CFLAGS": ["-mmacosx-version-min=10.15"],
        "CLANG_CXX_LIBRARY": "libc++"
      },
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
    },
    {
      "target_name": "universal_key_monitor",
      "sources": ["src/native/universal_key_monitor.mm"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "libraries": [
        "-framework Carbon",
        "-framework CoreFoundation",
        "-framework ApplicationServices",
        "-framework Cocoa",
        "-framework IOKit"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "OTHER_CFLAGS": ["-mmacosx-version-min=10.15"],
        "CLANG_CXX_LIBRARY": "libc++"
      },
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
    },
    {
      "target_name": "nsevent_monitor",
      "sources": ["src/native/nsevent_monitor.mm"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "libraries": [
        "-framework Cocoa",
        "-framework Foundation"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "xcode_settings": {
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "OTHER_CFLAGS": ["-mmacosx-version-min=10.15"],
        "CLANG_CXX_LIBRARY": "libc++"
      },
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
    }
  ]
}
