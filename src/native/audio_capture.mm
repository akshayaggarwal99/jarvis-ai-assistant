#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#include <napi.h>
#include <thread>
#include <atomic>
#include <mutex>

@interface AudioCaptureManager : NSObject <AVCaptureAudioDataOutputSampleBufferDelegate>
@property (nonatomic, strong) AVCaptureSession *captureSession;
@property (nonatomic, strong) AVCaptureDeviceInput *audioInput;
@property (nonatomic, strong) AVCaptureAudioDataOutput *audioOutput;
@property (nonatomic, strong) dispatch_queue_t audioQueue;
@property (nonatomic, copy) void (^audioDataCallback)(NSData *audioData);
@property (nonatomic, assign) BOOL isCapturing;
@property (nonatomic, assign) BOOL isSettingUp;
@end

@implementation AudioCaptureManager

- (instancetype)init {
    if (self = [super init]) {
        _isCapturing = NO;
        _isSettingUp = NO;
        _audioQueue = dispatch_queue_create("audio.capture.queue", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}

- (BOOL)startCapture:(void (^)(NSData *))callback {
    if (_isCapturing || _isSettingUp) return NO;
    
    _audioDataCallback = [callback copy]; // Properly copy the block
    
    // Request microphone permission synchronously if possible
    AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
    if (status == AVAuthorizationStatusNotDetermined) {
        // Need to request permission asynchronously
        _isSettingUp = YES;
        [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
            dispatch_async(dispatch_get_main_queue(), ^{
                self.isSettingUp = NO;
                if (granted) {
                    [self setupCaptureSession];
                }
            });
        }];
        return YES; // Will setup async
    } else if (status != AVAuthorizationStatusAuthorized) {
        return NO; // Permission denied
    }
    
    return [self setupCaptureSession];
}

- (BOOL)setupCaptureSession {
    _captureSession = [[AVCaptureSession alloc] init];
    
    // Get default audio input device
    AVCaptureDevice *audioDevice = [AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeAudio];
    if (!audioDevice) return NO;
    
    NSError *error;
    _audioInput = [AVCaptureDeviceInput deviceInputWithDevice:audioDevice error:&error];
    if (!_audioInput || error) return NO;
    
    if ([_captureSession canAddInput:_audioInput]) {
        [_captureSession addInput:_audioInput];
    } else {
        return NO;
    }
    
    // Setup audio output with specific format for OpenAI Realtime API
    _audioOutput = [[AVCaptureAudioDataOutput alloc] init];
    [_audioOutput setSampleBufferDelegate:self queue:_audioQueue];
    
    // Configure audio settings for Deepgram: 16kHz, 16-bit PCM, mono (Linear16 format)
    NSDictionary *audioSettings = @{
        AVFormatIDKey: @(kAudioFormatLinearPCM),
        AVSampleRateKey: @(16000.0),           // 16kHz optimal for speech recognition
        AVNumberOfChannelsKey: @(1),           // Mono
        AVLinearPCMBitDepthKey: @(16),         // 16-bit
        AVLinearPCMIsFloatKey: @(NO),          // Integer samples
        AVLinearPCMIsBigEndianKey: @(NO),      // Little endian
        AVLinearPCMIsNonInterleaved: @(NO)     // Interleaved
    };
    
    [_audioOutput setAudioSettings:audioSettings];
    
    if ([_captureSession canAddOutput:_audioOutput]) {
        [_captureSession addOutput:_audioOutput];
    } else {
        return NO;
    }
    
    // Start session
    [_captureSession startRunning];
    _isCapturing = YES;
    
    return YES;
}

- (void)stopCapture {
    if (!_isCapturing) return;
    
    _isCapturing = NO;
    
    if (_captureSession) {
        [_captureSession stopRunning];
        [_captureSession removeInput:_audioInput];
        [_captureSession removeOutput:_audioOutput];
    }
    
    _captureSession = nil;
    _audioInput = nil;
    _audioOutput = nil;
    _audioDataCallback = nil; // Clear the callback
}

// AVCaptureAudioDataOutputSampleBufferDelegate
- (void)captureOutput:(AVCaptureOutput *)output 
       didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer 
       fromConnection:(AVCaptureConnection *)connection {
    
    if (!_audioDataCallback || !_isCapturing) return;
    
    // Convert audio buffer to PCM data with proper memory management
    CMBlockBufferRef blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer);
    if (!blockBuffer) return;
    
    size_t length = CMBlockBufferGetDataLength(blockBuffer);
    if (length == 0) return;
    
    // Use NSMutableData for safer memory management
    NSMutableData *audioData = [NSMutableData dataWithLength:length];
    if (!audioData) return;
    
    OSStatus status = CMBlockBufferCopyDataBytes(blockBuffer, 0, length, [audioData mutableBytes]);
    if (status != noErr) return;
    
    // Make a copy for the callback to ensure thread safety
    NSData *dataCopy = [audioData copy];
    if (_audioDataCallback && _isCapturing) {
        _audioDataCallback(dataCopy);
    }
}

@end

// Global instance with proper synchronization
static AudioCaptureManager *audioCaptureManager = nil;
static Napi::ThreadSafeFunction tsCallback;
static std::mutex callbackMutex;
static std::atomic<bool> callbackValid{false};

class AudioCaptureWorker {
public:
    static Napi::Value StartCapture(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (info.Length() < 1 || !info[0].IsFunction()) {
            Napi::TypeError::New(env, "Callback function required").ThrowAsJavaScriptException();
            return env.Null();
        }
        
        Napi::Function callback = info[0].As<Napi::Function>();
        
        std::lock_guard<std::mutex> lock(callbackMutex);
        
        // Clean up existing callback if any
        if (callbackValid.load()) {
            try {
                tsCallback.Release();
                callbackValid = false;
            } catch (...) {
                // Ignore if already released
            }
        }
        
        // Create thread-safe function with proper error handling
        try {
            tsCallback = Napi::ThreadSafeFunction::New(
                env,
                callback,
                "AudioCapture",
                0,      // Unlimited queue
                1,      // Single thread
                [](Napi::Env) { callbackValid = false; } // Finalizer
            );
            callbackValid = true;
        } catch (const std::exception& e) {
            Napi::Error::New(env, "Failed to create thread-safe callback").ThrowAsJavaScriptException();
            return env.Null();
        }
        
        if (!audioCaptureManager) {
            audioCaptureManager = [[AudioCaptureManager alloc] init];
        }
        
        BOOL success = [audioCaptureManager startCapture:^(NSData *audioData) {
            // Check if callback is still valid before using it
            if (!callbackValid.load() || !audioData) return;
            
            // Use NonBlocking call to avoid deadlocks
            auto callbackFn = [](Napi::Env env, Napi::Function jsCallback, NSData* data) {
                if (!data) return;
                
                try {
                    Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(
                        env, 
                        (const uint8_t*)[data bytes], 
                        [data length]
                    );
                    jsCallback.Call({buffer});
                } catch (const std::exception& e) {
                    // Log error but don't crash
                    NSLog(@"Error in audio callback: %s", e.what());
                }
            };
            
            if (callbackValid.load()) {
                napi_status status = tsCallback.NonBlockingCall(audioData, callbackFn);
                if (status != napi_ok) {
                    NSLog(@"Failed to call JS callback, status: %d", status);
                }
            }
        }];
        
        return Napi::Boolean::New(env, success);
    }
    
    static Napi::Value StopCapture(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (audioCaptureManager) {
            [audioCaptureManager stopCapture];
        }
        
        std::lock_guard<std::mutex> lock(callbackMutex);
        if (callbackValid.load()) {
            try {
                // Ensure we fully release and invalidate the thread safe function
                // This is critical to prevent segfaults if audio data comes in late
                if (tsCallback) {
                     tsCallback.Release();
                }
                callbackValid = false;
            } catch (...) {
                // Ignore if already released
            }
        }
        
        return env.Null();
    }
    
    static Napi::Value IsCapturing(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        BOOL capturing = audioCaptureManager ? audioCaptureManager.isCapturing : NO;
        return Napi::Boolean::New(env, capturing);
    }
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "startCapture"), 
                Napi::Function::New(env, AudioCaptureWorker::StartCapture));
    exports.Set(Napi::String::New(env, "stopCapture"), 
                Napi::Function::New(env, AudioCaptureWorker::StopCapture));
    exports.Set(Napi::String::New(env, "isCapturing"), 
                Napi::Function::New(env, AudioCaptureWorker::IsCapturing));
    return exports;
}

NODE_API_MODULE(audio_capture, Init)
