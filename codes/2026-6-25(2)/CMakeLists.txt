cmake_minimum_required(VERSION 3.15)
project(physics)

set(CMAKE_CXX_STANDARD 17)

# ── node-addon-api 헤더(napi.h) 경로 탐색 ──────────────────────────────────
# 전략 1: 프로젝트 node_modules 직접 참조 (npm install 완료 시 가장 신뢰성 높음)
set(NODE_ADDON_API_DIR "${CMAKE_SOURCE_DIR}/node_modules/node-addon-api")

# 전략 2: node 명령으로 탐색 (전략 1 실패 시)
if(NOT EXISTS "${NODE_ADDON_API_DIR}/napi.h")
  execute_process(
    COMMAND node -p "require('node-addon-api').include"
    WORKING_DIRECTORY "${CMAKE_SOURCE_DIR}"
    OUTPUT_VARIABLE _NAA_RAW
    OUTPUT_STRIP_TRAILING_WHITESPACE
    ERROR_QUIET
    RESULT_VARIABLE _NAA_RESULT
  )
  if(_NAA_RAW)
    string(REPLACE "\"" "" _NAA_RAW "${_NAA_RAW}")
    file(TO_CMAKE_PATH "${_NAA_RAW}" NODE_ADDON_API_DIR)
  endif()
endif()

# 탐색 실패 시 명확한 오류 출력
if(NOT EXISTS "${NODE_ADDON_API_DIR}/napi.h")
  message(FATAL_ERROR
    "\n"
    "[ERROR] napi.h 를 찾을 수 없습니다!\n"
    "이 폴더에서 먼저 실행하세요:\n"
    "  npm install\n"
    "탐색한 경로: ${NODE_ADDON_API_DIR}\n"
  )
endif()

message(STATUS "node-addon-api: ${NODE_ADDON_API_DIR}")

include_directories(
  "${NODE_ADDON_API_DIR}"
  "${CMAKE_JS_INC}"
)

add_library(physics SHARED
  physics/physics.cpp
  physics/binding.cpp
  ${CMAKE_JS_SRC}
)

set_target_properties(physics PROPERTIES PREFIX "" SUFFIX ".node")

target_compile_definitions(physics PRIVATE NAPI_DISABLE_CPP_EXCEPTIONS)

if(WIN32)
  target_link_libraries(physics "${CMAKE_JS_LIB}")
endif()

if(MSVC)
  target_compile_options(physics PRIVATE /O2 /std:c++17 /utf-8)
else()
  target_compile_options(physics PRIVATE -O2)
endif()
