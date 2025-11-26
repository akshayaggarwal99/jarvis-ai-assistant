#import <Foundation/Foundation.h>
#import <Carbon/Carbon.h>
#import <ApplicationServices/ApplicationServices.h>
#include <napi.h>
#include <map>
#include <string>

static CFMachPortRef eventTap = NULL;
static CFRunLoopSourceRef runLoopSource = NULL;
static Napi::ThreadSafeFunction tsfn;
static std::string monitoredKey = "fn";
static bool keyPressed = false;

// Key flag mappings
static const std::map<std::string, CGEventFlags> keyFlags = {
    {"fn", kCGEventFlagMaskSecondaryFn},
    {"option", kCGEventFlagMaskAlternate},
    {"control", kCGEventFlagMaskControl},
    {"command", kCGEventFlagMaskCommand}
};

CGEventRef eventCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *refcon) {
    if (type == kCGEventFlagsChanged) {
        CGEventFlags flags = CGEventGetFlags(event);
        
        // Check if our monitored key is pressed
        auto it = keyFlags.find(monitoredKey);
        if (it != keyFlags.end()) {
            bool currentKeyState = (flags & it->second) != 0;
            
            // Only trigger on state change to avoid duplicate events
            if (currentKeyState != keyPressed) {
                keyPressed = currentKeyState;
                
                // Call JavaScript callback on the main thread
                auto callback = [](Napi::Env env, Napi::Function jsCallback, bool* data) {
                    std::string eventName = monitoredKey;
                    std::transform(eventName.begin(), eventName.end(), eventName.begin(), ::toupper);
                    eventName += "_KEY_";
                    eventName += *data ? "DOWN" : "UP";
                    
                    jsCallback.Call({
                        Napi::String::New(env, eventName)
                    });
                };
                
                tsfn.BlockingCall(&keyPressed, callback);
            }
        }
    }
    return event;
}

Napi::Value CheckAccessibilityPermissions(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    // Check if accessibility permissions are granted
    bool isGranted = AXIsProcessTrusted();
    
    if (!isGranted) {
        // Prompt user for permissions
        NSDictionary *options = @{(__bridge id)kAXTrustedCheckOptionPrompt: @YES};
        bool promptResult = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
        
        // Update the result after prompting
        isGranted = promptResult;
    }
    
    return Napi::Boolean::New(env, isGranted);
}

Napi::Value StartMonitoring(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Callback function required").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Check accessibility permissions first
    if (!AXIsProcessTrusted()) {
        Napi::Error::New(env, "Accessibility permissions required. Please enable in System Settings > Privacy & Security > Accessibility").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Stop existing monitoring if active
    if (eventTap) {
        CGEventTapEnable(eventTap, false);
        CFRunLoopRemoveSource(CFRunLoopGetMain(), runLoopSource, kCFRunLoopCommonModes);
        CFRelease(runLoopSource);
        CFRelease(eventTap);
        eventTap = NULL;
        runLoopSource = NULL;
    }
    
    // Create thread-safe function for callback
    tsfn = Napi::ThreadSafeFunction::New(
        env,
        info[0].As<Napi::Function>(),
        "FnKeyCallback",
        0,
        1
    );
    
    // Create event tap for flag changes (Fn key detection)
    eventTap = CGEventTapCreate(
        kCGSessionEventTap,
        kCGHeadInsertEventTap,
        kCGEventTapOptionDefault,
        CGEventMaskBit(kCGEventFlagsChanged),
        eventCallback,
        NULL
    );
    
    if (!eventTap) {
        tsfn.Release();
        Napi::Error::New(env, "Failed to create event tap. Check accessibility permissions.").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Add to run loop
    runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0);
    CFRunLoopAddSource(CFRunLoopGetMain(), runLoopSource, kCFRunLoopCommonModes);
    CGEventTapEnable(eventTap, true);
    
    return Napi::Boolean::New(env, true);
}

Napi::Value StopMonitoring(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (eventTap) {
        CGEventTapEnable(eventTap, false);
        CFRunLoopRemoveSource(CFRunLoopGetMain(), runLoopSource, kCFRunLoopCommonModes);
        CFRelease(runLoopSource);
        CFRelease(eventTap);
        eventTap = NULL;
        runLoopSource = NULL;
        keyPressed = false;
        
        tsfn.Release();
    }
    
    return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "startMonitoring"), Napi::Function::New(env, StartMonitoring));
    exports.Set(Napi::String::New(env, "stopMonitoring"), Napi::Function::New(env, StopMonitoring));
    exports.Set(Napi::String::New(env, "checkAccessibilityPermissions"), Napi::Function::New(env, CheckAccessibilityPermissions));
    return exports;
}

NODE_API_MODULE(fn_key_monitor, Init)
