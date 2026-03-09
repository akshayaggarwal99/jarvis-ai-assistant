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
#include <sstream>
#include <string>

static id globalMonitor = nil;
static id localMonitor = nil;
static id keyDownMonitor = nil; // For letter/action key combinations
static CFMachPortRef eventTap = NULL;
static CFRunLoopSourceRef runLoopSource = NULL;
// static IOHIDManagerRef hidManager = NULL; // Unused - commented out
static Napi::ThreadSafeFunction tsfn;
static bool tsfnInitialized = false;
static std::string monitoredKey = "fn";
static bool keyPressed = false;
static NSEventModifierFlags requiredModifiers = 0;
static CGKeyCode targetKeyCode = 0; // For letter/action key combinations
static bool isLetterKeyCombination = false; // True if monitoring letter+modifier combo
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

// Key code mappings for letters and action keys (macOS CGKeyCode values)
static const std::map<std::string, CGKeyCode> keyCodes = {
    // Letters
    {"a", 0}, {"b", 11}, {"c", 8}, {"d", 2}, {"e", 14}, {"f", 3},
    {"g", 5}, {"h", 4}, {"i", 34}, {"j", 38}, {"k", 40}, {"l", 37},
    {"m", 46}, {"n", 45}, {"o", 31}, {"p", 35}, {"q", 12}, {"r", 15},
    {"s", 1}, {"t", 17}, {"u", 32}, {"v", 9}, {"w", 13}, {"x", 7},
    {"y", 16}, {"z", 6},
    // Numbers
    {"0", 29}, {"1", 18}, {"2", 19}, {"3", 20}, {"4", 21}, {"5", 23},
    {"6", 22}, {"7", 26}, {"8", 28}, {"9", 25},
    // Action keys
    {"space", 49}, {"return", 36}, {"enter", 36}, {"tab", 48},
    {"delete", 51}, {"backspace", 51}, {"escape", 53}, {"esc", 53},
    // Arrow keys
    {"left", 123}, {"right", 124}, {"down", 125}, {"up", 126},
    // Function keys
    {"f1", 122}, {"f2", 120}, {"f3", 99}, {"f4", 118}, {"f5", 96},
    {"f6", 97}, {"f7", 98}, {"f8", 100}, {"f9", 101}, {"f10", 109},
    {"f11", 103}, {"f12", 111},
    // Punctuation
    {"minus", 27}, {"-", 27}, {"equal", 24}, {"=", 24},
    {"leftbracket", 33}, {"[", 33}, {"rightbracket", 30}, {"]", 30},
    {"semicolon", 41}, {";", 41}, {"quote", 39}, {"'", 39},
    {"backslash", 42}, {"\\", 42}, {"comma", 43}, {",", 43},
    {"period", 47}, {".", 47}, {"slash", 44}, {"/", 44},
    {"grave", 50}, {"`", 50}};

// Parse multi-key combinations like "cmd+ctrl", "cmd+d", "ctrl+space", etc.
// Returns modifier flags, and sets targetKey and hasInvalidKeys via output parameters
NSEventModifierFlags parseKeyCombination(const std::string& keyCombo, CGKeyCode& targetKey, bool& hasInvalidKeys, bool& hasLetterKey) {
    NSEventModifierFlags combined = 0;
    targetKey = 0;
    hasInvalidKeys = false;
    hasLetterKey = false;
    int letterKeyCount = 0;
    
    // Check if this is a combination (contains '+')
    bool isCombination = (keyCombo.find('+') != std::string::npos);
    
    // For combinations, check for trailing/leading '+' or empty parts (++, +key, key+)
    if (isCombination) {
        if (keyCombo.empty() || keyCombo.front() == '+' || keyCombo.back() == '+') {
            hasInvalidKeys = true;
            return 0;
        }
        if (keyCombo.find("++") != std::string::npos) {
            hasInvalidKeys = true;
            return 0;
        }
    }
    
    // Split by '+' delimiter and process each part
    std::stringstream ss(keyCombo);
    std::string key;
    
    while (std::getline(ss, key, '+')) {
        // Trim whitespace
        key.erase(0, key.find_first_not_of(" \t"));
        key.erase(key.find_last_not_of(" \t") + 1);
        
        // After trimming, empty keys are invalid
        if (key.empty()) {
            hasInvalidKeys = true;
            continue;
        }
        
        // Convert to lowercase for consistent matching
        std::transform(key.begin(), key.end(), key.begin(), ::tolower);
        
        // Check if it's a modifier key
        auto modIt = keyFlags.find(key);
        if (modIt != keyFlags.end()) {
            combined |= modIt->second;
            continue;
        }
        
        // Check if it's a letter/action key
        auto keyIt = keyCodes.find(key);
        if (keyIt != keyCodes.end()) {
            targetKey = keyIt->second;
            hasLetterKey = true;
            letterKeyCount++;
            continue;
        }
        
        // Invalid key name found
        hasInvalidKeys = true;
    }
    
    // Validation: Can only have one letter/action key in a combination
    if (letterKeyCount > 1) {
        hasInvalidKeys = true;
        return 0;
    }
    
    // Letter key combinations MUST have at least one modifier
    if (hasLetterKey && combined == 0) {
        hasInvalidKeys = true;
        return 0;
    }
    
    // For combinations, all parts must be valid
    if (isCombination && hasInvalidKeys) {
        return 0;
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

  // Parse the key combination to get required modifiers and target key
  bool hasInvalidKeys = false;
  bool hasLetterKey = false;
  CGKeyCode parsedKeyCode = 0;
  NSEventModifierFlags parsedModifiers = parseKeyCombination(keyName, parsedKeyCode, hasInvalidKeys, hasLetterKey);

  // For single keys, validate against known keys
  if (keyName.find('+') == std::string::npos) {
    // Single key - check if it's a known modifier or letter key
    bool isModifier = (keyFlags.find(keyName) != keyFlags.end());
    bool isLetterKey = (keyCodes.find(keyName) != keyCodes.end());
    
    if (!isModifier && !isLetterKey) {
      Napi::TypeError::New(
          env,
          "Unsupported key. Supported: fn, option, control, command, shift, letters (a-z), numbers, space, or combinations like 'cmd+d', 'ctrl+space'")
          .ThrowAsJavaScriptException();
      return env.Null();
    }
    
    // Single letter keys without modifiers are not allowed (too easy to trigger accidentally)
    if (isLetterKey && !isModifier) {
      Napi::TypeError::New(
          env,
          "Single letter keys must be combined with a modifier (e.g., 'cmd+d', 'ctrl+space')")
          .ThrowAsJavaScriptException();
      return env.Null();
    }
  } else {
    // For combinations, ensure no invalid keys and at least one valid part
    if (hasInvalidKeys || (parsedModifiers == 0 && parsedKeyCode == 0)) {
      Napi::TypeError::New(
          env,
          "Invalid key combination. Use valid modifiers (cmd, ctrl, option, shift) with optional letter/action keys. Example: 'cmd+d', 'ctrl+space', 'cmd+shift+k'")
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
  if (keyDownMonitor) {
    [NSEvent removeMonitor:keyDownMonitor];
    keyDownMonitor = nil;
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

  // Set the key to monitor, required modifiers, and target key code
  monitoredKey = keyName;
  requiredModifiers = parsedModifiers;
  targetKeyCode = parsedKeyCode;
  isLetterKeyCombination = hasLetterKey;
  keyPressed = false;

  NSLog(@"Starting key monitoring for: %s (modifiers: 0x%lx, keyCode: %d, isLetterCombo: %d)", 
        keyName.c_str(), (unsigned long)requiredModifiers, targetKeyCode, isLetterKeyCombination);

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

  // For letter key combinations (cmd+d, ctrl+space, etc.), monitor key presses
  if (isLetterKeyCombination) {
    keyDownMonitor = [NSEvent
        addLocalMonitorForEventsMatchingMask:(NSEventMaskKeyDown | NSEventMaskKeyUp)
                                     handler:^NSEvent *(NSEvent *event) {
                                       NSEventType eventType = [event type];
                                       
                                       // Get current modifier flags and key code
                                       NSEventModifierFlags flags = [event modifierFlags];
                                       flags = flags & ~ignoredModifiers;
                                       unsigned short keyCode = [event keyCode];
                                       
                                       // Check if modifiers match
                                       bool modifiersMatch = (flags & requiredModifiers) == requiredModifiers;
                                       // Allow extra function key
                                       NSEventModifierFlags extraFlags = flags & ~requiredModifiers & ~NSEventModifierFlagFunction;
                                       modifiersMatch = modifiersMatch && (extraFlags == 0);
                                       
                                       // Check if key code matches
                                       bool keyCodeMatches = (keyCode == targetKeyCode);
                                       
                                       // Trigger on key down/up only if both modifiers and key match
                                       if (modifiersMatch && keyCodeMatches) {
                                         bool isKeyDown = (eventType == NSEventTypeKeyDown);
                                         if (isKeyDown != keyPressed) {
                                           keyPressed = isKeyDown;
                                           handleKeyEvent(isKeyDown);
                                         }
                                         // Suppress the event to prevent default action
                                         return nil;
                                       }
                                       
                                       return event; // Pass through if not matching
                                     }];
    NSLog(@"Letter key combination monitoring enabled for: %s", keyName.c_str());
  }

  if (keyName.find('+') != std::string::npos && !isLetterKeyCombination) {
    NSLog(@"Multi-key combination monitoring enabled for: %s", keyName.c_str());
  } else if (keyName != "fn" && !isLetterKeyCombination) {
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
  if (keyDownMonitor) {
    [NSEvent removeMonitor:keyDownMonitor];
    keyDownMonitor = nil;
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
  
  // Add single modifier keys
  for (const auto &pair : keyFlags) {
    result[index++] = Napi::String::New(env, pair.first);
  }
  
  // Add common modifier-only combinations
  std::vector<std::string> combinations = {
    "cmd+ctrl", "cmd+option", "cmd+shift",
    "ctrl+option", "ctrl+shift", 
    "option+shift",
    "cmd+ctrl+shift", "cmd+option+shift", "ctrl+option+shift"
  };
  
  for (const auto &combo : combinations) {
    result[index++] = Napi::String::New(env, combo);
  }
  
  // Add common letter key combinations
  std::vector<std::string> letterCombos = {
    "cmd+d", "cmd+k", "cmd+space", "cmd+shift+k",
    "ctrl+space", "ctrl+d", "ctrl+k",
    "option+space"
  };
  
  for (const auto &combo : letterCombos) {
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
