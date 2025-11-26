#import <Foundation/Foundation.h>
#import <Cocoa/Cocoa.h>
#include <napi.h>

static id globalMonitor = nil;
static id localMonitor = nil;
static Napi::ThreadSafeFunction tsfn;
static bool tsfnInitialized = false;

Napi::Value StartNSEventMonitoring(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Usage: startNSEventMonitoring(callback)").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Stop existing monitoring
    if (globalMonitor) {
        [NSEvent removeMonitor:globalMonitor];
        globalMonitor = nil;
    }
    if (localMonitor) {
        [NSEvent removeMonitor:localMonitor];
        localMonitor = nil;
    }
    if (tsfnInitialized) {
        tsfn.Release();
        tsfnInitialized = false;
    }
    
    // Create thread-safe function for callback
    tsfn = Napi::ThreadSafeFunction::New(
        env,
        info[0].As<Napi::Function>(),
        "NSEventCallback",
        0,
        1
    );
    tsfnInitialized = true;
    
    // Monitor function key events globally (even when app is not active)
    globalMonitor = [NSEvent addGlobalMonitorForEventsMatchingMask:NSEventMaskFlagsChanged
                                                           handler:^(NSEvent *event) {
        NSEventModifierFlags flags = [event modifierFlags];
        static BOOL fnKeyPressed = NO;
        BOOL currentFnState = (flags & NSEventModifierFlagFunction) != 0;
        
        if (currentFnState != fnKeyPressed) {
            fnKeyPressed = currentFnState;
            
            // Call JavaScript callback
            auto callback = [](Napi::Env env, Napi::Function jsCallback, BOOL* data) {
                std::string eventName = *data ? "FN_KEY_DOWN" : "FN_KEY_UP";
                jsCallback.Call({
                    Napi::String::New(env, eventName)
                });
            };
            
            tsfn.BlockingCall(&fnKeyPressed, callback);
        }
    }];
    
    // Monitor local events (when app is active) - this allows us to suppress
    localMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskFlagsChanged
                                                         handler:^NSEvent *(NSEvent *event) {
        NSEventModifierFlags flags = [event modifierFlags];
        
        // Suppress function key events to prevent emoji picker
        if ((flags & NSEventModifierFlagFunction) != 0) {
            return nil; // Suppress the event
        }
        
        return event; // Allow other events
    }];
    
    return Napi::Boolean::New(env, true);
}

Napi::Value StopNSEventMonitoring(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (globalMonitor) {
        [NSEvent removeMonitor:globalMonitor];
        globalMonitor = nil;
    }
    if (localMonitor) {
        [NSEvent removeMonitor:localMonitor];
        localMonitor = nil;
    }
    
    if (tsfnInitialized) {
        tsfn.Release();
        tsfnInitialized = false;
    }
    
    return Napi::Boolean::New(env, true);
}

Napi::Object InitNSEvent(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "startNSEventMonitoring"), Napi::Function::New(env, StartNSEventMonitoring));
    exports.Set(Napi::String::New(env, "stopNSEventMonitoring"), Napi::Function::New(env, StopNSEventMonitoring));
    return exports;
}

NODE_API_MODULE(nsevent_monitor, InitNSEvent)
