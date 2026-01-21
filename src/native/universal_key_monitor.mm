#import <ApplicationServices/ApplicationServices.h>
#import <Carbon/Carbon.h>
#import <Cocoa/Cocoa.h>
#import <Foundation/Foundation.h>
#import <IOKit/hid/IOHIDElement.h>
#import <IOKit/hid/IOHIDManager.h>
#import <IOKit/hid/IOHIDValue.h>
#include <algorithm>
#include <map>
#include <napi.h>
#include <string>

static id globalMonitor = nil;
static id localMonitor = nil;
static CFMachPortRef eventTap = NULL;
static CFRunLoopSourceRef runLoopSource = NULL;
// static IOHIDManagerRef hidManager = NULL; // Unused - commented out
static Napi::ThreadSafeFunction tsfn;
static bool tsfnInitialized = false;
static std::string monitoredKey = "fn";
static bool keyPressed = false;
// static CFAbsoluteTime lastFnKeyTime = 0; // Unused - commented out
// static const CFTimeInterval DOUBLE_TAP_THRESHOLD = 0.5; // Unused - commented
// out

// Key flag mappings for NSEvent
static const std::map<std::string, NSEventModifierFlags> keyFlags = {
    {"fn", NSEventModifierFlagFunction},
    {"option", NSEventModifierFlagOption},
    {"control", NSEventModifierFlagControl},
    {"command", NSEventModifierFlagCommand},
    {"shift", NSEventModifierFlagShift}};

void handleKeyEvent(bool isKeyDown) {
  if (tsfnInitialized) {
    // OPTIMIZED: Direct callback without verbose logging
    auto callback = [isKeyDown](Napi::Env env, Napi::Function jsCallback) {
      std::string eventName = monitoredKey;
      std::transform(eventName.begin(), eventName.end(), eventName.begin(),
                     ::toupper);
      eventName += "_KEY_";
      eventName += isKeyDown ? "DOWN" : "UP";

      jsCallback.Call({Napi::String::New(env, eventName)});
    };

    tsfn.BlockingCall(callback);
  }
}

// IOKit HID callback for low-level hardware key interception
// Currently unused but kept for potential future low-level monitoring
/*
static void hidInputValueCallback(void *context, IOReturn result, void *sender,
IOHIDValueRef value) { IOHIDElementRef element = IOHIDValueGetElement(value);
    uint32_t usage = IOHIDElementGetUsage(element);
    uint32_t usagePage = IOHIDElementGetUsagePage(element);
    CFIndex intValue = IOHIDValueGetIntegerValue(value);

    // Function key is on Generic Desktop usage page (0x01) with usage 0x18 (or
similar)
    // We need to intercept and suppress it
    if (usagePage == kHIDPage_GenericDesktop && usage == 0x18 && monitoredKey ==
"fn") {
        // Handle our callback
        bool isKeyDown = (intValue != 0);
        if (isKeyDown != keyPressed) {
            keyPressed = isKeyDown;
            handleKeyEvent(isKeyDown);
        }

        // Don't let the event continue - this should prevent emoji picker
        return;
    }
}
*/

// AGGRESSIVE CGEventTap callback that COMPLETELY SUPPRESSES function key
CGEventRef eventTapCallback(CGEventTapProxy proxy, CGEventType type,
                            CGEventRef event, void *refcon) {
  if (type == kCGEventTapDisabledByTimeout ||
      type == kCGEventTapDisabledByUserInput) {
    CGEventTapEnable(eventTap, true);
    return event;
  }

  if (monitoredKey == "fn") {
    // Handle function key modifier flag changes (most reliable)
    if (type == kCGEventFlagsChanged) {
      CGEventFlags flags = CGEventGetFlags(event);
      bool isFnPressed = (flags & kCGEventFlagMaskSecondaryFn) != 0;
      // Check if this is ONLY a function key event or if other modifiers are
      // involved
      bool hasOtherModifiers =
          (flags & (kCGEventFlagMaskCommand | kCGEventFlagMaskShift |
                    kCGEventFlagMaskControl | kCGEventFlagMaskAlternate)) != 0;

      // OPTIMIZED: Only fire events on state changes
      if (isFnPressed != keyPressed) {
        keyPressed = isFnPressed;
        handleKeyEvent(isFnPressed);
      }

      // CRITICAL: Only suppress if this is a pure function key event
      if (!hasOtherModifiers && (isFnPressed || keyPressed)) {
        return NULL; // Block only pure function key events
      }

      return event; // Pass through events with other modifiers
    }

    // OPTIMIZED: Suppress raw keyboard events for function key
    if (type == kCGEventKeyDown || type == kCGEventKeyUp) {
      CGKeyCode keyCode = (CGKeyCode)CGEventGetIntegerValueField(
          event, kCGKeyboardEventKeycode);

      // Function key codes (various possible codes)
      if (keyCode == 63 || keyCode == 179 ||
          keyCode == 0x3F) { // Common fn key codes
        return NULL;         // Block completely - no logging for performance
      }
    }
  }

  return event; // Allow other events to continue normally
}

Napi::Value CheckAccessibilityPermissions(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  // Check if accessibility permissions are granted
  bool isGranted = AXIsProcessTrusted();

  if (!isGranted) {
    // Prompt user for permissions
    NSDictionary *options = @{(__bridge id)kAXTrustedCheckOptionPrompt : @YES};
    bool promptResult =
        AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);

    // Update the result after prompting
    isGranted = promptResult;
  }

  return Napi::Boolean::New(env, isGranted);
}

Napi::Value StartMonitoring(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "Usage: startMonitoring(keyName, callback)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string keyName = info[0].As<Napi::String>().Utf8Value();

  // Validate key name
  if (keyFlags.find(keyName) == keyFlags.end()) {
    Napi::TypeError::New(
        env, "Unsupported key. Supported keys: fn, option, control, command")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  // Stop existing monitoring if active
  if (globalMonitor) {
    [NSEvent removeMonitor:globalMonitor];
    globalMonitor = nil;
  }
  if (localMonitor) {
    [NSEvent removeMonitor:localMonitor];
    localMonitor = nil;
  }
  if (eventTap) {
    CGEventTapEnable(eventTap, false);
    CFMachPortInvalidate(eventTap);
    CFRelease(eventTap);
    eventTap = NULL;
  }
  if (runLoopSource) {
    CFRunLoopRemoveSource(CFRunLoopGetCurrent(), runLoopSource,
                          kCFRunLoopCommonModes);
    CFRelease(runLoopSource);
    runLoopSource = NULL;
  }

  // OPTIMIZED: Pre-configure system to avoid runtime calls
  if (keyName == "fn") {
    // Only log once for debugging
    NSLog(@"Function key monitoring enabled - emoji picker suppression active");
  }

  // Set the key to monitor
  monitoredKey = keyName;
  keyPressed = false;

  // Create thread-safe function for callback
  tsfn = Napi::ThreadSafeFunction::New(env, info[1].As<Napi::Function>(),
                                       "UniversalKeyCallback", 0, 1);
  tsfnInitialized = true;

  // Get the modifier flag for this key
  auto it = keyFlags.find(keyName);
  NSEventModifierFlags targetFlag = it->second;

  // For function key, use AGGRESSIVE CGEventTap that catches ALL events
  if (keyName == "fn") {
    // Create an aggressive event tap that intercepts EVERYTHING related to
    // function key
    eventTap = CGEventTapCreate(
        kCGSessionEventTap,       // Session event tap (more compatible)
        kCGHeadInsertEventTap,    // Insert at head for priority
        kCGEventTapOptionDefault, // Default options
        CGEventMaskBit(kCGEventFlagsChanged) | CGEventMaskBit(kCGEventKeyDown) |
            CGEventMaskBit(kCGEventKeyUp), // Monitor flags AND raw key events
        eventTapCallback,                  // Callback function
        NULL                               // User data
    );

    if (eventTap) {
      // Create a run loop source and add it to the current run loop
      runLoopSource =
          CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0);
      CFRunLoopAddSource(CFRunLoopGetMain(), runLoopSource,
                         kCFRunLoopCommonModes);

      // Enable the event tap
      CGEventTapEnable(eventTap, true);

      NSLog(@"AGGRESSIVE function key monitoring enabled - will SUPPRESS all "
            @"fn events to prevent emoji picker");
    } else {
      NSLog(@"Failed to create function key event tap");
    }
  }

  // Also use NSEvent monitoring as backup (for non-fn keys only)
  if (keyName != "fn") {
    // Monitor ALL event types globally (even when app is not active)
    globalMonitor = [NSEvent
        addGlobalMonitorForEventsMatchingMask:(NSEventMaskFlagsChanged |
                                               NSEventMaskKeyDown |
                                               NSEventMaskKeyUp)
                                      handler:^(NSEvent *event) {
                                        if ([event type] ==
                                            NSEventTypeFlagsChanged) {
                                          NSEventModifierFlags flags =
                                              [event modifierFlags];
                                          bool currentKeyState =
                                              (flags & targetFlag) != 0;

                                          if (currentKeyState != keyPressed) {
                                            keyPressed = currentKeyState;
                                            handleKeyEvent(currentKeyState);
                                          }
                                        }
                                      }];

    // Monitor local events (when app is active)
    localMonitor = [NSEvent
        addLocalMonitorForEventsMatchingMask:(NSEventMaskFlagsChanged |
                                              NSEventMaskKeyDown |
                                              NSEventMaskKeyUp)
                                     handler:^NSEvent *(NSEvent *event) {
                                       NSEventType eventType = [event type];
                                       NSEventModifierFlags flags =
                                           [event modifierFlags];

                                       // Handle modifier flag changes
                                       if (eventType ==
                                           NSEventTypeFlagsChanged) {
                                         bool currentKeyState =
                                             (flags & targetFlag) != 0;

                                         if (currentKeyState != keyPressed) {
                                           keyPressed = currentKeyState;
                                           handleKeyEvent(currentKeyState);
                                         }
                                       }

                                       return event; // Allow other events for
                                                     // non-fn keys
                                     }];
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value StopMonitoring(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (globalMonitor) {
    [NSEvent removeMonitor:globalMonitor];
    globalMonitor = nil;
  }
  if (localMonitor) {
    [NSEvent removeMonitor:localMonitor];
    localMonitor = nil;
  }
  if (eventTap) {
    CGEventTapEnable(eventTap, false);
    CFMachPortInvalidate(eventTap);
    CFRelease(eventTap);
    eventTap = NULL;
  }
  if (runLoopSource) {
    CFRunLoopRemoveSource(CFRunLoopGetCurrent(), runLoopSource,
                          kCFRunLoopCommonModes);
    CFRelease(runLoopSource);
    runLoopSource = NULL;
  }

  // RESTORE macOS emoji picker functionality when stopping fn monitoring
  if (monitoredKey == "fn") {
    system("defaults delete com.apple.HIToolbox AppleFnUsageType 2>/dev/null "
           "|| true");
    system("defaults write -g NSAutomaticSpellingCorrectionEnabled -bool true");
    system("defaults write -g NSAutomaticTextCompletionEnabled -bool true");
  }

  keyPressed = false;

  if (tsfnInitialized) {
    tsfn.Release();
    tsfnInitialized = false;
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value GetSupportedKeys(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Array result = Napi::Array::New(env);

  int index = 0;
  for (const auto &pair : keyFlags) {
    result[index++] = Napi::String::New(env, pair.first);
  }

  return result;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "startMonitoring"),
              Napi::Function::New(env, StartMonitoring));
  exports.Set(Napi::String::New(env, "stopMonitoring"),
              Napi::Function::New(env, StopMonitoring));
  exports.Set(Napi::String::New(env, "checkAccessibilityPermissions"),
              Napi::Function::New(env, CheckAccessibilityPermissions));
  exports.Set(Napi::String::New(env, "getSupportedKeys"),
              Napi::Function::New(env, GetSupportedKeys));
  return exports;
}

NODE_API_MODULE(universal_key_monitor, Init)
