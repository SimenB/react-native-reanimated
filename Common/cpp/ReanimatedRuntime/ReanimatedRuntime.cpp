#include "ReanimatedRuntime.h"

#include <cxxreact/MessageQueueThread.h>
#include <jsi/jsi.h>

#include <memory>
#include <utility>

#if (__has_include( \
         <reacthermes/HermesExecutorFactory.h>) || __has_include(<hermes/hermes.h>) || JS_RUNTIME_HERMES)
#include "ReanimatedHermesRuntime.h"
#elif JS_RUNTIME_V8
#include <v8runtime/V8RuntimeFactory.h>
#else
#include <jsi/JSCRuntime.h>
#endif

namespace reanimated {

using namespace facebook;
using namespace react;

#if (__has_include( \
         <reacthermes/HermesExecutorFactory.h>) || __has_include(<hermes/hermes.h>) || JS_RUNTIME_HERMES)

std::shared_ptr<jsi::Runtime> makeHermesReanimatedRuntime(
    std::shared_ptr<MessageQueueThread> jsQueue) {
  std::unique_ptr<facebook::hermes::HermesRuntime> runtime =
      facebook::hermes::makeHermesRuntime();
  facebook::hermes::HermesRuntime &hermesRuntime = *runtime;

  return std::make_shared<ReanimatedHermesRuntime>(
      std::move(runtime), hermesRuntime, jsQueue);
}

#elif JS_RUNTIME_V8

std::shared_ptr<jsi::Runtime> makeV8ReanimatedRuntime(
    std::shared_ptr<MessageQueueThread> jsQueue) {
  jsQueue->quitSynchronous();

  auto config = std::make_unique<rnv8::V8RuntimeConfig>();
  config->enableInspector = false;
  config->appName = "reanimated";
  return rnv8::createSharedV8Runtime(runtime_, std::move(config));
}

#else

std::shared_ptr<jsi::Runtime> makeJSCReanimatedRuntime(
    std::shared_ptr<MessageQueueThread> jsQueue) {
  jsQueue->quitSynchronous();

  return facebook::jsc::makeJSCRuntime();
}

#endif

std::shared_ptr<jsi::Runtime> ReanimatedRuntime::make(
    std::shared_ptr<MessageQueueThread> jsQueue) {
#if (__has_include( \
         <reacthermes/HermesExecutorFactory.h>) || __has_include(<hermes/hermes.h>) || JS_RUNTIME_HERMES)
  return makeHermesReanimatedRuntime(jsQueue);
#elif JS_RUNTIME_V8
  return makeV8ReanimatedRuntime(jsQueue);
#else
  return makeJSCReanimatedRuntime(jsQueue);
#endif
}

} // namespace reanimated