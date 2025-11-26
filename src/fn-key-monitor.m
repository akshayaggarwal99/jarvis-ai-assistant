#import <Foundation/Foundation.h>
#import <Carbon/Carbon.h>
#import <IOKit/hidsystem/IOHIDLib.h>

@interface FnKeyMonitor : NSObject
- (void)startMonitoring;
- (void)stopMonitoring;
@end

@implementation FnKeyMonitor {
    CFMachPortRef eventTap;
    CFRunLoopSourceRef runLoopSource;
}

CGEventRef eventCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *refcon) {
    if (type == kCGEventFlagsChanged) {
        CGEventFlags flags = CGEventGetFlags(event);
        
        // Fn key is mapped to kCGEventFlagMaskSecondaryFn (0x800000)
        if (flags & kCGEventFlagMaskSecondaryFn) {
            printf("FN_KEY_DOWN\n");
            fflush(stdout);
        } else {
            printf("FN_KEY_UP\n"); 
            fflush(stdout);
        }
    }
    
    return event;
}

- (void)startMonitoring {
    // Check for accessibility permissions
    if (!AXIsProcessTrusted()) {
        printf("ERROR_NO_ACCESSIBILITY_PERMISSION\n");
        fflush(stdout);
        return;
    }
    
    eventTap = CGEventTapCreate(
        kCGSessionEventTap,
        kCGHeadInsertEventTap,
        kCGEventTapOptionDefault,
        CGEventMaskBit(kCGEventFlagsChanged),
        eventCallback,
        NULL
    );
    
    if (!eventTap) {
        printf("ERROR_EVENT_TAP_FAILED\n");
        fflush(stdout);
        return;
    }
    
    runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0);
    CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, kCFRunLoopCommonModes);
    CGEventTapEnable(eventTap, true);
    
    printf("MONITORING_STARTED\n");
    fflush(stdout);
    
    CFRunLoopRun();
}

- (void)stopMonitoring {
    if (eventTap) {
        CGEventTapEnable(eventTap, false);
        CFRunLoopRemoveSource(CFRunLoopGetCurrent(), runLoopSource, kCFRunLoopCommonModes);
        CFRelease(runLoopSource);
        CFRelease(eventTap);
        eventTap = NULL;
        runLoopSource = NULL;
    }
    CFRunLoopStop(CFRunLoopGetCurrent());
}

@end

int main(int argc, char *argv[]) {
    @autoreleasepool {
        FnKeyMonitor *monitor = [[FnKeyMonitor alloc] init];
        [monitor startMonitoring];
    }
    return 0;
}
