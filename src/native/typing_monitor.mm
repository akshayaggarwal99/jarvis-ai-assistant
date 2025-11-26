#import <Foundation/Foundation.h>
#import <Carbon/Carbon.h>
#import <ApplicationServices/ApplicationServices.h>
#import <AppKit/AppKit.h>
#include <napi.h>

static CFMachPortRef eventTap = NULL;
static CFRunLoopSourceRef runLoopSource = NULL;
static Napi::ThreadSafeFunction tsfn;
static bool tsfnValid = false;
static NSDate *lastKeyEvent = nil;
static NSTimer *debounceTimer = nil;

CGEventRef typingEventCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *refcon) {
    // Monitor key down events for typing detection
    if (type == kCGEventKeyDown) {
        // Get key code
        CGKeyCode keyCode = (CGKeyCode)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
        
        // Get modifier flags
        CGEventFlags flags = CGEventGetFlags(event);
        
        // Filter out modifier keys themselves (these don't represent typing)
        if (keyCode == 54 || keyCode == 55 || // Command keys
            keyCode == 56 || keyCode == 60 || // Shift keys  
            keyCode == 58 || keyCode == 61 || // Option keys
            keyCode == 59 || keyCode == 62) { // Control keys
            return event; // Ignore modifier keys
        }
        
        // SPECIAL HANDLING: Allow Function key (63 and 179) to pass through for push-to-talk
        if (keyCode == 63 || keyCode == 179) {
            NSLog(@"[TypingMonitor] Allowing Function key (%d) to pass through for push-to-talk", keyCode);
            return event; // Let Function key events reach the universal key monitor
        }
        
        // Filter out function keys (F1-F12, etc.)
        if (keyCode >= 122 && keyCode <= 133) { // F1-F12
            return event;
        }
        
        // Filter out arrow keys, page up/down, home, end
        if (keyCode == 123 || keyCode == 124 || keyCode == 125 || keyCode == 126 || // Arrow keys
            keyCode == 116 || keyCode == 121 || keyCode == 115 || keyCode == 119) { // Page Up/Down, Home, End
            return event;
        }
        
        // Filter out non-typing keys: Escape, Tab, Delete, Return/Enter
        if (keyCode == 53 || // Escape
            keyCode == 48 || // Tab
            keyCode == 51 || // Delete/Backspace
            keyCode == 117 || // Forward delete
            keyCode == 36 || // Return/Enter
            keyCode == 76) { // Enter (numeric keypad)
            return event; // Ignore these keys
        }
        
        // ENHANCED: Check for ANY modifier keys pressed (comprehensive filtering)
        bool hasCommand = (flags & kCGEventFlagMaskCommand);
        bool hasControl = (flags & kCGEventFlagMaskControl);
        bool hasOption = (flags & kCGEventFlagMaskAlternate);
        bool hasFn = (flags & kCGEventFlagMaskSecondaryFn);
        
        // Special exception: Allow Command+Option+J (key 38) to pass through for dashboard shortcut
        if (hasCommand && hasOption && !hasControl && !hasFn && keyCode == 38) {
            // Don't filter this specific combination - let it reach the global shortcut handler
            NSLog(@"[TypingMonitor] Allowing dashboard shortcut: Cmd+Option+J (key=38)");
            return event;
        }
        
        // Ignore ALL other events with modifier keys - these are system shortcuts, not typing
        if (hasCommand || hasControl || hasOption || hasFn) {
            // Log what we're filtering out for debugging
            NSLog(@"[TypingMonitor] Filtered shortcut: key=%d cmd=%d ctrl=%d opt=%d fn=%d", 
                  keyCode, hasCommand, hasControl, hasOption, hasFn);
            return event; // Ignore all other modifier combinations
        }
        
        // Additional filtering for special keys that might not be caught above
        if (keyCode == 71 || // Clear (numeric keypad)
            keyCode == 114 || // Help
            keyCode == 96 || // F5 (alternative code)
            keyCode == 97 || // F6 (alternative code)
            keyCode == 98 || // F7 (alternative code)
            keyCode == 100 || // F8 (alternative code)
            keyCode == 101 || // F9 (alternative code)
            keyCode == 109 || // F10 (alternative code)
            keyCode == 103 || // F11 (alternative code)
            keyCode == 111 || // F12 (alternative code)
            keyCode == 105 || // Media keys
            keyCode == 107 || // Screen brightness
            keyCode == 113 || // Volume
            keyCode == 106 || // More media keys
            keyCode == 64 || // Right Function key
            keyCode == 65 || // Numeric keypad decimal
            keyCode == 67 || // Numeric keypad multiply
            keyCode == 69 || // Numeric keypad plus
            keyCode == 75 || // Numeric keypad divide
            keyCode == 78 || // Numeric keypad minus
            keyCode == 81 || // Numeric keypad equals
            keyCode == 82 || // Numeric keypad 0
            keyCode == 83 || // Numeric keypad 1
            keyCode == 84 || // Numeric keypad 2
            keyCode == 85 || // Numeric keypad 3
            keyCode == 86 || // Numeric keypad 4
            keyCode == 87 || // Numeric keypad 5
            keyCode == 88 || // Numeric keypad 6
            keyCode == 89 || // Numeric keypad 7
            keyCode == 91 || // Numeric keypad 8
            keyCode == 92) { // Numeric keypad 9
            return event; // Ignore these special keys
        }
        
        // ENHANCED: Only consider it typing if it's a regular character key
        // AND we're not in a secure/password context
        
        // Check if the current application or input field suggests secure entry
        bool isSecureContext = false;
        
        // Get the frontmost application
        NSWorkspace *workspace = [NSWorkspace sharedWorkspace];
        NSRunningApplication *frontApp = workspace.frontmostApplication;
        NSString *bundleIdentifier = frontApp.bundleIdentifier;
        
        // Check for password managers and security-related apps
        if ([bundleIdentifier containsString:@"1password"] ||
            [bundleIdentifier containsString:@"lastpass"] ||
            [bundleIdentifier containsString:@"bitwarden"] ||
            [bundleIdentifier containsString:@"keychain"] ||
            [bundleIdentifier containsString:@"password"] ||
            [bundleIdentifier containsString:@"security"] ||
            [bundleIdentifier containsString:@"auth"] ||
            [bundleIdentifier isEqualToString:@"com.apple.loginwindow"] ||
            [bundleIdentifier isEqualToString:@"com.apple.screensaver"] ||
            [bundleIdentifier isEqualToString:@"com.apple.SecurityAgent"]) {
            isSecureContext = true;
        }
        
        // Check window title for password/secure indicators
        CFArrayRef windowList = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID);
        if (windowList) {
            CFIndex count = CFArrayGetCount(windowList);
            for (CFIndex i = 0; i < count; i++) {
                CFDictionaryRef window = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);
                CFStringRef windowName = (CFStringRef)CFDictionaryGetValue(window, kCGWindowName);
                CFNumberRef windowLayer = (CFNumberRef)CFDictionaryGetValue(window, kCGWindowLayer);
                
                if (windowName && windowLayer) {
                    NSString *title = (__bridge NSString *)windowName;
                    NSString *lowercaseTitle = [title lowercaseString];
                    
                    // Check for password/security related window titles
                    if ([lowercaseTitle containsString:@"password"] ||
                        [lowercaseTitle containsString:@"login"] ||
                        [lowercaseTitle containsString:@"sign in"] ||
                        [lowercaseTitle containsString:@"authentication"] ||
                        [lowercaseTitle containsString:@"security"] ||
                        [lowercaseTitle containsString:@"keychain"] ||
                        [lowercaseTitle containsString:@"unlock"] ||
                        [lowercaseTitle containsString:@"credentials"]) {
                        isSecureContext = true;
                        break;
                    }
                }
            }
            CFRelease(windowList);
        }
        
        // Don't track typing in secure contexts
        if (isSecureContext) {
            NSLog(@"[TypingMonitor] Ignoring typing in secure context: %@", bundleIdentifier);
            return event;
        }
        // Valid typing keys are typically: letters (a-z), numbers (0-9), and basic symbols
        // Key codes for main keyboard area: 0-50 (approximately)
        if (keyCode > 50) {
            // EXCEPTION: Allow Fn key (179) to pass through for push-to-talk functionality
            if (keyCode == 179) {
                NSLog(@"[TypingMonitor] Allowing Fn key (179) to pass through for push-to-talk");
                return event; // Let Fn key events reach the universal key monitor
            }
            
            // Most keys above 50 are special keys, numeric keypad, or function keys
            NSLog(@"[TypingMonitor] Filtered special key: %d", keyCode);
            return event;
        }
        
        // At this point, this should be actual typing (letters, numbers, symbols without modifiers)
        // Log for debugging what keys we're detecting as typing
        NSLog(@"[TypingMonitor] Detected typing key: %d", keyCode);
        
        lastKeyEvent = [NSDate date];
        
        // Debounce: Cancel existing timer and start a new one
        if (debounceTimer) {
            [debounceTimer invalidate];
        }
        
        // Set a 500ms debounce timer - if no more typing happens, trigger the callback
        debounceTimer = [NSTimer scheduledTimerWithTimeInterval:0.5
                                                        repeats:NO
                                                          block:^(NSTimer * _Nonnull timer) {
            // Call JavaScript callback on the main thread
            auto callback = [](Napi::Env env, Napi::Function jsCallback) {
                jsCallback.Call({
                    Napi::String::New(env, "TYPING_DETECTED")
                });
            };
            
            if (tsfnValid) {
                tsfn.NonBlockingCall(callback);
            }
            debounceTimer = nil;
        }];
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

Napi::Value FastPasteText(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected string argument").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    std::string text = info[0].As<Napi::String>().Utf8Value();
    
    // Check accessibility permissions first
    bool hasPermissions = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)@{
        (__bridge NSString*)kAXTrustedCheckOptionPrompt: @NO
    });
    
    if (!hasPermissions) {
        return Napi::Boolean::New(env, false);
    }
    
    @try {
        NSString *nsText = [NSString stringWithUTF8String:text.c_str()];
        NSLog(@"[FastPaste] Text to paste: %@", nsText);
        
        // SECURITY: Save original clipboard for restoration (but never log/access content)
        NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
        NSArray *originalClasses = @[[NSString class]];
        NSDictionary *originalOptions = @{};
        NSArray *originalContents = [pasteboard readObjectsForClasses:originalClasses options:originalOptions];
        
        NSLog(@"[FastPaste] Setting clipboard to: %@", nsText);
        
        // Set new clipboard content
        [pasteboard clearContents];
        BOOL setSuccess = [pasteboard setString:nsText forType:NSPasteboardTypeString];
        NSLog(@"[FastPaste] Clipboard set success: %d", setSuccess);
        
        if (!setSuccess) {
            NSLog(@"[FastPaste] Failed to set clipboard content");
            return Napi::Boolean::New(env, false);
        }
        
        // Ensure clipboard is ready
        usleep(50000); // 50ms to ensure clipboard is ready
        
        // Verify clipboard was set correctly (only for our text, not original)
        NSArray *verifyContents = [pasteboard readObjectsForClasses:originalClasses options:originalOptions];
        NSString *verifyClipboard = verifyContents.count > 0 ? verifyContents[0] : @"";
        NSLog(@"[FastPaste] Clipboard verification: %@", verifyClipboard);
        
        // Create CMD+V key events
        CGEventRef keyDownEvent = CGEventCreateKeyboardEvent(NULL, (CGKeyCode)9, true); // V key
        CGEventRef keyUpEvent = CGEventCreateKeyboardEvent(NULL, (CGKeyCode)9, false);
        
        // Set CMD modifier
        CGEventSetFlags(keyDownEvent, kCGEventFlagMaskCommand);
        CGEventSetFlags(keyUpEvent, kCGEventFlagMaskCommand);
        
        // Post events
        CGEventPost(kCGSessionEventTap, keyDownEvent);
        usleep(5000); // 5ms between key events
        CGEventPost(kCGSessionEventTap, keyUpEvent);
        
        // Clean up events
        CFRelease(keyDownEvent);
        CFRelease(keyUpEvent);
        
        NSLog(@"[FastPaste] Paste operation completed");
        
        // SECURITY: Restore original clipboard after paste (content never logged/transmitted)
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            if (originalContents.count > 0) {
                [pasteboard clearContents];
                [pasteboard setString:originalContents[0] forType:NSPasteboardTypeString];
                NSLog(@"[FastPaste] Clipboard restored after 1 second");
            } else {
                [pasteboard clearContents];
                NSLog(@"[FastPaste] Clipboard cleared after 1 second (was empty)");
            }
        });
        
        return Napi::Boolean::New(env, true);
        
    } @catch (NSException *exception) {
        NSLog(@"[FastPaste] Exception occurred: %@", exception.reason);
        return Napi::Boolean::New(env, false);
    }
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
    
    // Invalidate any existing timer
    if (debounceTimer) {
        [debounceTimer invalidate];
        debounceTimer = nil;
    }
    
    // Create thread-safe function for callback
    tsfn = Napi::ThreadSafeFunction::New(
        env,
        info[0].As<Napi::Function>(),
        "TypingCallback",
        0,
        1
    );
    tsfnValid = true;
    
    // Create event tap for key down events
    eventTap = CGEventTapCreate(
        kCGSessionEventTap,
        kCGHeadInsertEventTap,
        kCGEventTapOptionDefault,
        CGEventMaskBit(kCGEventKeyDown),
        typingEventCallback,
        NULL
    );
    
    if (!eventTap) {
        tsfn.Release();
        tsfnValid = false;
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
        
        if (tsfnValid) {
            tsfn.Release();
            tsfnValid = false;
        }
    }
    
    // Invalidate timer
    if (debounceTimer) {
        [debounceTimer invalidate];
        debounceTimer = nil;
    }
    
    return Napi::Boolean::New(env, true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "startMonitoring"), Napi::Function::New(env, StartMonitoring));
    exports.Set(Napi::String::New(env, "stopMonitoring"), Napi::Function::New(env, StopMonitoring));
    exports.Set(Napi::String::New(env, "checkAccessibilityPermissions"), Napi::Function::New(env, CheckAccessibilityPermissions));
    exports.Set(Napi::String::New(env, "fastPasteText"), Napi::Function::New(env, FastPasteText));
    return exports;
}

NODE_API_MODULE(typing_monitor, Init)
