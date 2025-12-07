import AVFoundation
import CoreMedia
import Combine

class AudioRecorder: NSObject, ObservableObject, AVCaptureAudioDataOutputSampleBufferDelegate {
    private var captureSession: AVCaptureSession?
    private var audioOutput: AVCaptureAudioDataOutput?
    
    @Published var isRecording = false
    @Published var isProcessing = false
    @Published var permissionDenied = false
    
    // Callback for audio data
    var onAudioData: ((Data) -> Void)?
    var onError: ((String) -> Void)?
    
    // Queue for processing audio sample buffers
    private let audioQueue = DispatchQueue(label: "com.jarvis.audioQueue")
    
    override init() {
        super.init()
    }
    
    private func setupAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            // Keep the robust category
            try session.setCategory(.playAndRecord, mode: .default, options: [.duckOthers, .allowBluetooth, .defaultToSpeaker])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            print("[AudioRecorder] Audio session setup successful")
        } catch {
            print("[AudioRecorder] Failed to setup audio session: \(error)")
            onError?("Audio session failed: \(error.localizedDescription)")
        }
    }
    
    func requestPermissionAndRecord() {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            startRecordingInternal()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .audio) { [weak self] granted in
                DispatchQueue.main.async {
                    if granted {
                        self?.startRecordingInternal()
                    } else {
                        self?.permissionDenied = true
                        self?.onError?("Microphone access denied. Enable in Settings.")
                    }
                }
            }
        case .denied, .restricted:
            permissionDenied = true
            onError?("Microphone access denied. Enable in Settings.")
        @unknown default:
            onError?("Unknown permission state")
        }
    }
    
    func startRecording() {
        startRecordingInternal()
    }
    
    private func startRecordingInternal() {
        print("[AudioRecorder] Starting recording (AVCaptureSession)...")
        setupAudioSession()
        
        audioQueue.async { [weak self] in
            guard let self = self else { return }
            
            do {
                self.captureSession = AVCaptureSession()
                self.captureSession?.beginConfiguration()
                
                // Add Input
                guard let microphone = AVCaptureDevice.default(for: .audio) else {
                    throw NSError(domain: "AudioRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "No microphone available"])
                }
                
                let input = try AVCaptureDeviceInput(device: microphone)
                if self.captureSession?.canAddInput(input) == true {
                    self.captureSession?.addInput(input)
                } else {
                     throw NSError(domain: "AudioRecorder", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot add mic input"])
                }
                
                // Add Output
                self.audioOutput = AVCaptureAudioDataOutput()
                self.audioOutput?.setSampleBufferDelegate(self, queue: self.audioQueue)
                
                if self.captureSession?.canAddOutput(self.audioOutput!) == true {
                    self.captureSession?.addOutput(self.audioOutput!)
                } else {
                     throw NSError(domain: "AudioRecorder", code: 3, userInfo: [NSLocalizedDescriptionKey: "Cannot add audio output"])
                }
                
                self.captureSession?.commitConfiguration()
                self.captureSession?.startRunning()
                
                DispatchQueue.main.async {
                    self.isRecording = true
                    print("[AudioRecorder] Started AVCaptureSession successfully")
                }
                
            } catch {
                print("[AudioRecorder] Failed to start capture session: \(error)")
                DispatchQueue.main.async {
                    self.onError?("Capture Failed: \(error.localizedDescription)")
                    self.cleanupSession()
                }
            }
        }
    }
    
    func stopRecording(completion: @escaping (Data?) -> Void) {
        print("[AudioRecorder] Stopping recording...")
        
        audioQueue.async { [weak self] in
            guard let self = self else { return }
            
            self.captureSession?.stopRunning()
            self.cleanupSession()
            
            DispatchQueue.main.async {
                self.isRecording = false
                // Return accumulated data
                let data = self.accumulatedData
                self.accumulatedData = Data() // Reset
                completion(data)
            }
        }
    }
    
    private func cleanupSession() {
        captureSession = nil
        audioOutput = nil
    }
    
    private var accumulatedData = Data()
    
    // MARK: - AVCaptureAudioDataOutputSampleBufferDelegate
    
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard isRecording else { return }
        
        // Extract data from CMSampleBuffer
        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }
        
        var lengthAtOffset: Int = 0
        var totalLength: Int = 0
        var dataPtr: UnsafeMutablePointer<Int8>? = nil
        
        let status = CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: &lengthAtOffset, totalLengthOut: &totalLength, dataPointerOut: &dataPtr)
        
        if status == kCMBlockBufferNoErr, let dataPtr = dataPtr {
            let data = Data(bytes: dataPtr, count: totalLength)
            
            // Append and Callback
             DispatchQueue.main.async { [weak self] in
                 self?.accumulatedData.append(data)
                 self?.onAudioData?(data)
             }
        }
    }
}

extension Data {
    init(buffer: AVAudioPCMBuffer) {
        let audioBuffer = buffer.audioBufferList.pointee.mBuffers
        self.init(bytes: audioBuffer.mData!, count: Int(audioBuffer.mDataByteSize))
    }
}
