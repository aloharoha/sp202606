cmake_minimum_required(VERSION 3.15)
project(physics)

set(CMAKE_CXX_STANDARD 17)

# node-addon-api 헤더(napi.h) 경로 탐색
execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(REPLACE "\"" "" NODE_ADDON_API_DIR "${NODE_ADDON_API_DIR}")
# 경로에 공백/역슬래시가 있어도 안전하도록 정규화
file(TO_CMAKE_PATH "${NODE_ADDON_API_DIR}" NODE_ADDON_API_DIR)

# 따옴표로 감싸 공백 포함 경로(예: OneDrive\바탕 화면)에서도 분리되지 않도록 함
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
  # /utf-8: 한글 주석(UTF-8) 소스의 C4819 경고/데이터 손실 방지
  target_compile_options(physics PRIVATE /O2 /std:c++17 /utf-8)
else()
  target_compile_options(physics PRIVATE -O2)
endif()
