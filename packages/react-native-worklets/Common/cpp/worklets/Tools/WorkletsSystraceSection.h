#pragma once
#include <string>
#include <vector>

#ifdef WORKLETS_PROFILING

#if defined(__APPLE__)
#include <os/trace_base.h>

#if OS_LOG_TARGET_HAS_10_15_FEATURES
#include <os/log.h>
#include <os/signpost.h>
#include <sstream>
#endif // OS_LOG_TARGET_HAS_10_15_FEATURES

#elif defined(ANDROID)

#include <android/trace.h>

#endif // defined(ANDROID)

#endif // WORKLETS_PROFILING

namespace worklets {

#if defined(ANDROID) && defined(WORKLETS_PROFILING)

// avg 6.10 min 2.87 max 7.68 dev 0.42
// avg 6.09 min 3.29 max 8.62 dev 0.50

struct WorkletsSystraceSection {
 public:
  template <typename... ConvertsToStringPiece>
  explicit WorkletsSystraceSection(
      const char *name,
      ConvertsToStringPiece &&...args) {
    ATrace_beginSection(name);
  }

  ~WorkletsSystraceSection() {
    ATrace_endSection();
  }
};

// The apple part is copied from React Native
// from
// https://github.com/facebook/react-native/blob/5697d923a05119314b4cfcd556cb243986637764/packages/react-native/ReactCommon/cxxreact/SystraceSection.h
#elif defined(__APPLE__) && OS_LOG_TARGET_HAS_10_15_FEATURES && \
    defined(WORKLETS_PROFILING)

template <typename T, typename = void>
struct renderer {
  static std::string render(const T &t) {
    std::ostringstream oss;
    oss << t;
    return oss.str();
  }
};

template <typename T>
static auto render(const T &t)
    -> decltype(renderer<T>::render(std::declval<const T &>())) {
  return renderer<T>::render(t);
}

inline os_log_t instrumentsLogHandle = nullptr;

static inline os_log_t getOrCreateInstrumentsLogHandle() {
  if (!instrumentsLogHandle) {
    instrumentsLogHandle = os_log_create(
        "dev.worklets.instruments", OS_LOG_CATEGORY_POINTS_OF_INTEREST);
  }
  return instrumentsLogHandle;
}

struct WorkletsSystraceSection {
 public:
  template <typename... ConvertsToStringPiece>
  explicit WorkletsSystraceSection(
      const char *name,
      ConvertsToStringPiece &&...args) {
    os_log_t instrumentsLogHandle = worklets::getOrCreateInstrumentsLogHandle();

    // If the log isn't enabled, we don't want the performance overhead of the
    // rest of the code below.
    if (!os_signpost_enabled(instrumentsLogHandle)) {
      return;
    }

    name_ = name;

    const auto argsVector = std::vector<std::string>{worklets::render(args)...};
    std::string argsString = "";
    for (size_t i = 0; i < argsVector.size(); i += 2) {
      argsString += argsVector[i] + "=" + argsVector[i + 1] + ";";
    }

    signpostID_ = os_signpost_id_make_with_pointer(instrumentsLogHandle, this);

    os_signpost_interval_begin(
        instrumentsLogHandle,
        signpostID_,
        "Worklets",
        "%s begin: %s",
        name,
        argsString.c_str());
  }

  ~WorkletsSystraceSection() {
    os_signpost_interval_end(
        worklets::instrumentsLogHandle,
        signpostID_,
        "Worklets",
        "%s end",
        name_.data());
  }

 private:
  os_signpost_id_t signpostID_ = OS_SIGNPOST_ID_INVALID;
  std::string_view name_;
};

#else

struct WorkletsSystraceSection {
 public:
  template <typename... ConvertsToStringPiece>
  explicit WorkletsSystraceSection(
      const char *name,
      ConvertsToStringPiece &&...args) {}
};

#endif // defined(__APPLE__) && OS_LOG_TARGET_HAS_10_15_FEATURES &&
       // defined(WORKLETS_PROFILING)

} // namespace worklets
