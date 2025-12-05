import Foundation
import AVFoundation
import Combine

class AudioRecorder: NSObject, ObservableObject {
    private var audioEngine: AVAudioEngine?
    private var inputNode: AVAudioInputNode?
    private var audioConverter: AVAudioConverter?
    
    @Published var isRecording = false
    @Published var isProcessing = false
    @Published var permissionDenied = false
    
    // Callback for audio data
    var onAudioData: ((Data) -> Void)?
    var onError: ((String) -> Void)?
    
    override init() {
        super.init()
    }
    
    private func setupAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            print("[AudioRecorder] Audio session setup successful")
        } catch {
            print("[AudioRecorder] Failed to setup audio session: \(error)")
            onError?("Audio session failed: \(error.localizedDescription)")
        }
    }
    
    func requestPermissionAndRecord() {
        print("[AudioRecorder] Requesting microphone permission...")
        
        AVAudioApplication.requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                if granted {
                    print("[AudioRecorder] Microphone permission granted")
                    self?.permissionDenied = false
                    self?.startRecordingInternal()
                } else {
                    print("[AudioRecorder] Microphone permission denied")
                    self?.permissionDenied = true
                    self?.onError?("Microphone access denied. Enable in Settings.")
                }
            }
        }
    }
    
    func startRecording() {
        // Check current permission status first
        let status = AVAudioApplication.shared.recordPermission
        print("[AudioRecorder] Current permission status: \(status.rawValue)")
        
        switch status {
        case .granted:
            startRecordingInternal()
        case .denied:
            print("[AudioRecorder] Permission previously denied")
            permissionDenied = true
            onError?("Microphone access denied. Enable in Settings.")
        case .undetermined:
            requestPermissionAndRecord()
        @unknown default:
            requestPermissionAndRecord()
        }
    }
    
    private func startRecordingInternal() {
        print("[AudioRecorder] Starting recording...")
        
        // Always setup audio session fresh
        setupAudioSession()
        
        // Create new engine each time
        audioEngine = AVAudioEngine()
        guard let audioEngine = audioEngine else { return }
        
        inputNode = audioEngine.inputNode
        
        let inputFormat = inputNode!.outputFormat(forBus: 0)
        let recordingFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: false)!
        
        audioConverter = AVAudioConverter(from: inputFormat, to: recordingFormat)
        
        inputNode!.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { [weak self] (buffer, time) in
            guard let self = self, self.isRecording else { return }
            self.processAudioBuffer(buffer)
        }
        
        do {
            try audioEngine.start()
            isRecording = true
            print("[AudioRecorder] Started recording successfully")
        } catch {
            print("[AudioRecorder] Audio Engine failed to start: \(error)")
            // Reset state on failure
            cleanupEngine()
        }
    }
    
    func stopRecording(completion: @escaping (Data?) -> Void) {
        print("[AudioRecorder] Stopping recording...")
        isRecording = false
        
        // Stop and cleanup
        cleanupEngine()
        
        // Return accumulated data
        let data = self.accumulatedData
        self.accumulatedData = Data() // Reset
        completion(data)
    }
    
    private func cleanupEngine() {
        audioEngine?.stop()
        inputNode?.removeTap(onBus: 0)
        audioEngine = nil
        inputNode = nil
        audioConverter = nil
    }
    
    private var accumulatedData = Data()
    
    private func processAudioBuffer(_ buffer: AVAudioPCMBuffer) {
        guard let converter = audioConverter else { return }
        
        let ratio = converter.outputFormat.sampleRate / converter.inputFormat.sampleRate
        let capacity = UInt32(Double(buffer.frameCapacity) * ratio)
        
        guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: converter.outputFormat, frameCapacity: capacity) else { return }
        
        var error: NSError? = nil
        let inputBlock: AVAudioConverterInputBlock = { inNumPackets, outStatus in
            outStatus.pointee = .haveData
            return buffer
        }
        
        converter.convert(to: outputBuffer, error: &error, withInputFrom: inputBlock)
        
        if let error = error {
            print("Audio conversion error: \(error)")
            return
        }
        
        // Convert to Data
        let audioData = Data(buffer: outputBuffer)
        
        // Log every 10th buffer to avoid spam, but prove it's working
        if Int.random(in: 0...20) == 0 {
            print("[AudioRecorder] Generated \(audioData.count) bytes")
        }

        // Append to accumulator
        accumulatedData.append(audioData)
        
        // Also call callback for streaming (if we had it)
        onAudioData?(audioData)
    }
}

extension Data {
    init(buffer: AVAudioPCMBuffer) {
        let audioBuffer = buffer.audioBufferList.pointee.mBuffers
        self.init(bytes: audioBuffer.mData!, count: Int(audioBuffer.mDataByteSize))
    }
}
