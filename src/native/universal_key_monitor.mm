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
static NSEventModifierFlags requiredModifiers = 0;
static NSEventModifierFlags ignoredModifiers = NSEventModifierFlagCapsLock | NSEventModifierFlagNumericPad | NSEventModifierFlagHelp;
// static CFAbsoluteTime lastFnKeyTime = 0; // Unused - commented out
// static const CFTimeInterval DOUBLE_TAP_THRESHOLD = 0.5; // Unused - commented
// out

// Key flag mappings for NSEvent
static const std::map<std::string, NSEventModifierFlags> keyFlags = {
    {"fn", NSEventModifierFlagFunction},
    {"option", NSEventModifierFlagOption},
    {"control", NSEventModifierFlagControl},
    {"command", NSEventModifierFlagCommand},
    {"cmd", NSEventModifierFlagCommand},  // Alias for command
    {"ctrl", NSEventModifierFlagControl}, // Alias for control
    {"shift", NSEventModifierFlagShift}};

// Parse multi-key combinations like "cmd+ctrl", "cmd+option", etc.
NSEventModifierFlags parseKeyCombination(const std::string& keyCombo) {
    NSEventModifierFlags combined = 0;
    
    // Split by '+' delimiter
    std::string remaining = keyCombo;
    size_t pos = 0;
    
    while ((pos = remaining.find('+')) != std::string::npos || !remaining.empty()) {
        std::string key;
        if (pos != std::string::npos) {
            key = remaining.substr(0, pos);
            remaining = remaining.substr(pos + 1);
        } else {
            key = remaining;
            remaining = "";
        }
        
        // Trim whitespace
        key.erase(0, key.find_first_not_of(" \t"));
        key.erase(key.find_last_not_of(" \t") + 1);
        
        // Convert to lowercase for consistent matching
        std::transform(key.begin(), key.end(), key.begin(), ::tolower);
        
        // Add flag for this key
        auto it = keyFlags.find(key);
        if (it != keyFlags.end()) {
            combined |= it->second;
        }
        
        if (remaining.empty()) break;
    }
    
    return combined;
}

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

// AGGRESSIVE CGEventTap callback that handles both single keys and multi-key combinations
CGEventRef eventTapCallback(CGEventTapProxy proxy, CGEventType type,
                            CGEventRef event, void *refcon) {
  if (type == kCGEventTapDisabledByTimeout ||
      type == kCGEventTapDisabledByUserInput) {
    CGEventTapEnable(eventTap, true);
    return event;
  }

  // Handle modifier flag changes for all monitored keys
  if (type == kCGEventFlagsChanged) {
    CGEventFlags flags = CGEventGetFlags(event);
    
    // Mask out flags we want to ignore (Caps Lock, Num Pad, Help, etc.)
    flags = flags & ~ignoredModifiers;
    
    // For multi-key combinations, check if all required modifiers are pressed (and no extras)
    if (requiredModifiers != 0) {
      bool isPressed = (flags & requiredModifiers) == requiredModifiers;
      
      // For combinations, ensure ONLY the required modifiers are pressed (no extras)
      // Exception: Allow function key even if not explicitly required (for compatibility)
      NSEventModifierFlags allowedExtra = NSEventModifierFlagFunction;
      NSEventModifierFlags extraFlags = flags & ~requiredModifiers & ~allowedExtra;
      
      bool hasValidCombination = isPressed && (extraFlags == 0);
      
      // OPTIMIZED: Only fire events on state changes
      if (hasValidCombination != keyPressed) {
        keyPressed = hasValidCombination;
        handleKeyEvent(hasValidCombination);
      }
      
      // For multi-key combinations, don't suppress - let system handle normally
      return event;
    }
    
    // Legacy single function key handling (for backwards compatibility)
    if (monitoredKey == "fn") {
      bool isFnPressed = (flags & kCGEventFlagMaskSecondaryFn) != 0;
      // Check if this is ONLY a function key event or if other modifiers are involved
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
  }

  // OPTIMIZED: Suppress raw keyboard events for function key only (not combinations)
  if (monitoredKey == "fn" && (type == kCGEventKeyDown || type == kCGEventKeyUp)) {
    CGKeyCode keyCode = (CGKeyCode)CGEventGetIntegerValueField(
        event, kCGKeyboardEventKeycode);

    // Function key codes (various possible codes)
    if (keyCode == 63 || keyCode == 179) { // Common fn key codes
      return NULL; // Block completely - no logging for performance
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

  // Parse the key combination to get required modifiers
  NSEventModifierFlags parsedModifiers = parseKeyCombination(keyName);

  // For single keys, validate against known keys
  if (keyName.find('+') == std::string::npos) {
    if (keyFlags.find(keyName) == keyFlags.end()) {
      Napi::TypeError::New(
          env,
          "Unsupported key. Supported keys: fn, option, control, command, shift, or combinations like 'cmd+ctrl', 'cmd+option'")
          .ThrowAsJavaScriptException();
      return env.Null();
    }
  } else {
    // For combinations, ensure at least one valid modifier was parsed
    if (parsedModifiers == 0) {
      Napi::TypeError::New(
          env,
          "Invalid key combination. Use combinations like 'cmd+ctrl', 'cmd+option', 'ctrl+option'")
          .ThrowAsJavaScriptException();
      return env.Null();
    }
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

  // Set the key to monitor and required modifiers
  monitoredKey = keyName;
  requiredModifiers = parsedModifiers;
  keyPressed = false;

  NSLog(@"Starting key monitoring for: %s (modifiers: 0x%lx)", 
        keyName.c_str(), (unsigned long)requiredModifiers);

  // Create thread-safe function for callback
  tsfn = Napi::ThreadSafeFunction::New(env, info[1].As<Napi::Function>(),
                                       "UniversalKeyCallback", 0, 1);
  tsfnInitialized = true;

  // Use CGEventTap ONLY for function key (requires suppression)
  // Use NSEvent for all other keys and combinations (simpler and more reliable)
  bool needsCGEventTap = (keyName == "fn");

  if (needsCGEventTap) {
    // Create an event tap for function key (needs suppression)
    eventTap = CGEventTapCreate(
        kCGSessionEventTap,       // Session event tap (more compatible)
        kCGHeadInsertEventTap,    // Insert at head for priority
        kCGEventTapOptionDefault, // Default options
        CGEventMaskBit(kCGEventFlagsChanged) | CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventKeyUp),
        eventTapCallback,         // Callback function
        NULL                      // User data
    );

    if (eventTap) {
      // Create a run loop source and add it to the current run loop
      runLoopSource =
          CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0);
      CFRunLoopAddSource(CFRunLoopGetMain(), runLoopSource,
                         kCFRunLoopCommonModes);

      // Enable the event tap
      CGEventTapEnable(eventTap, true);
      NSLog(@"Function key monitoring enabled - emoji picker suppression active");
    } else {
      NSLog(@"Failed to create event tap for function key");
      return Napi::Boolean::New(env, false);
    }
  }

  // For ALL keys (single and combinations), use NSEvent monitoring as primary/fallback
  // NSEvent is simpler, more reliable, and works in all contexts
  NSEventModifierFlags targetFlag = requiredModifiers;
  
  // Monitor ALL event types globally (even when app is not active)
  globalMonitor = [NSEvent
      addGlobalMonitorForEventsMatchingMask:(NSEventMaskFlagsChanged)
                                    handler:^(NSEvent *event) {
                                      if ([event type] == NSEventTypeFlagsChanged) {
                                        NSEventModifierFlags flags = [event modifierFlags];
                                        // Mask out ignored flags
                                        flags = flags & ~ignoredModifiers;
                                        
                                        // For combinations, check if all required modifiers are pressed
                                        bool currentKeyState;
                                        if (keyName.find('+') != std::string::npos) {
                                          // Multi-key combination: all modifiers must be present, no extras allowed
                                          currentKeyState = (flags & targetFlag) == targetFlag;
                                          // Allow function key as extra (for compatibility)
                                          NSEventModifierFlags extraFlags = flags & ~targetFlag & ~NSEventModifierFlagFunction;
                                          currentKeyState = currentKeyState && (extraFlags == 0);
                                        } else {
                                          // Single key: just check if that modifier is present
                                          currentKeyState = (flags & targetFlag) != 0;
                                        }

                                        if (currentKeyState != keyPressed) {
                                          keyPressed = currentKeyState;
                                          handleKeyEvent(currentKeyState);
                                        }
                                      }
                                    }];

  // Monitor local events (when app is active)
  localMonitor = [NSEvent
      addLocalMonitorForEventsMatchingMask:(NSEventMaskFlagsChanged)
                                   handler:^NSEvent *(NSEvent *event) {
                                     NSEventType eventType = [event type];
                                     if (eventType == NSEventTypeFlagsChanged) {
                                       NSEventModifierFlags flags = [event modifierFlags];
                                       // Mask out ignored flags
                                       flags = flags & ~ignoredModifiers;
                                       
                                       // For combinations, check if all required modifiers are pressed
                                       bool currentKeyState;
                                       if (keyName.find('+') != std::string::npos) {
                                         // Multi-key combination: all modifiers must be present, no extras allowed
                                         currentKeyState = (flags & targetFlag) == targetFlag;
                                         // Allow function key as extra (for compatibility)
                                         NSEventModifierFlags extraFlags = flags & ~targetFlag & ~NSEventModifierFlagFunction;
                                         currentKeyState = currentKeyState && (extraFlags == 0);
                                       } else {
                                         // Single key: just check if that modifier is present
                                         currentKeyState = (flags & targetFlag) != 0;
                                       }

                                       if (currentKeyState != keyPressed) {
                                         keyPressed = currentKeyState;
                                         handleKeyEvent(currentKeyState);
                                       }
                                     }
                                     return event; // Always pass through
                                   }];

  if (keyName.find('+') != std::string::npos) {
    NSLog(@"Multi-key combination monitoring enabled for: %s", keyName.c_str());
  } else if (keyName != "fn") {
    NSLog(@"Single modifier key monitoring enabled for: %s", keyName.c_str());
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
  
  // Add single keys
  for (const auto &pair : keyFlags) {
    result[index++] = Napi::String::New(env, pair.first);
  }
  
  // Add common multi-key combinations
  std::vector<std::string> combinations = {
    "cmd+ctrl", "cmd+option", "cmd+shift",
    "ctrl+option", "ctrl+shift", 
    "option+shift",
    "cmd+ctrl+shift", "cmd+option+shift", "ctrl+option+shift"
  };
  
  for (const auto &combo : combinations) {
    result[index++] = Napi::String::New(env, combo);
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
