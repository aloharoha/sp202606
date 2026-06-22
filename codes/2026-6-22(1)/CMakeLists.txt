cmake_minimum_required(VERSION 3.15)
project(physics)

set(CMAKE_CXX_STANDARD 17)

execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})

execute_process(
  COMMAND node -p "process.versions.modules"
  OUTPUT_VARIABLE NODE_MODULE_VERSION
  OUTPUT_STRIP_TRAILING_WHITESPACE
)

execute_process(
  COMMAND node -e "console.log(require('path').dirname(process.execPath))"
  OUTPUT_VARIABLE NODE_BIN_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)

if(WIN32)
  set(NODE_LIB_DIR "$ENV{USERPROFILE}/.cmake-js/node-x64/${CMAKE_VS_PLATFORM_TOOLSET}/node.lib" )
  find_file(NODE_LIB node.lib
    HINTS
      "$ENV{APPDATA}/npm/node_modules/cmake-js/node_modules"
      "$ENV{USERPROFILE}/.cmake-js"
    PATH_SUFFIXES "node-x64/lib"
  )
endif()

include_directories(
  ${NODE_ADDON_API_DIR}
  ${CMAKE_JS_INC}
)

add_library(physics SHARED
  physics/physics.cpp
  physics/binding.cpp
  ${CMAKE_JS_SRC}
)

set_target_properties(physics PROPERTIES PREFIX "" SUFFIX ".node")

target_compile_definitions(physics PRIVATE NAPI_DISABLE_CPP_EXCEPTIONS)

if(WIN32)
  target_link_libraries(physics ${CMAKE_JS_LIB})
endif()

if(MSVC)
  target_compile_options(physics PRIVATE /O2 /std:c++17)
else()
  target_compile_options(physics PRIVATE -O2)
endif()
