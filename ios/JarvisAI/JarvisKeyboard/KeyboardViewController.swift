import UIKit
import SwiftUI

class KeyboardViewController: UIInputViewController {
    
    private var audioRecorder = AudioRecorder()
    private var transcriptionService: TranscriptionService?
    private var deepgramService: DeepgramService?
    private var localSpeechService: LocalSpeechService?
    private var jarvisCore: JarvisCore?
    
    // State
    private var isRecording = false
    private var useDeepgram = false
    private var useLocal = false
    
    override func viewDidLoad() {
        super.viewDidLoad()
        print("[Keyboard] VERSION: 2.0 (Pulse UI + Late Transcript Fix)")
        
        setupServices()
        setupUI()
    }
    
    private func setupServices() {
        // 1. Setup OpenAI (Required for Formatting)
        if let openAIKey = SecureAPIService.shared.getOpenAIKey() {
            transcriptionService = TranscriptionService(apiKey: openAIKey)
            jarvisCore = JarvisCore(apiKey: openAIKey)
        }
        
        // 2. Setup Deepgram (Preferred for Transcription)
        if let deepgramKey = SecureAPIService.shared.getDeepgramKey() {
            print("[Keyboard] Deepgram Key found: \(deepgramKey.prefix(5))...")
            deepgramService = DeepgramService(apiKey: deepgramKey)
            
            // Live transcript updates (for UI feedback)
            deepgramService?.onTranscript = { [weak self] text in
                self?.handleLiveTranscript(text)
            }
            
            // Final complete transcript (for processing)
            deepgramService?.onFinalTranscript = { [weak self] fullText in
                self?.handleFinalTranscript(fullText)
            }
            
            deepgramService?.onError = { [weak self] error in
                let msg = error.localizedDescription
                // Check for common connection errors
                if msg.contains("Socket is not connected") {
                    self?.handleError("Connection Failed. Check Internet or 'Allow Full Access'")
                } else {
                    self?.handleError(msg)
                }
            }
            useDeepgram = true
        } else {
            print("[Keyboard] No Deepgram Key found in App Group!")
        }
        
        // 3. Setup Local Speech (Fallback or Option)
        localSpeechService = LocalSpeechService()
        localSpeechService?.onTranscript = { [weak self] text in
            self?.handleLiveTranscript(text)
        }
        
        // Logic to decide which to use:
        // If Deepgram Key exists -> Use Deepgram
        // Else -> Use Local (Free, Fast)
        // OpenAI Whisper is fallback if Local fails or user prefers it (not implemented here)
        
        if !useDeepgram {
            useLocal = true
            localSpeechService?.requestAuthorization()
        }
    }
    
    private func setupUI() {
        let keyboardView = KeyboardView(
            audioRecorder: audioRecorder,
            onRecordStart: startRecording,
            onRecordStop: stopRecording,
            onCancel: { [weak self] in
                self?.cancelRecording()
            },
            onReturn: { [weak self] in
                self?.textDocumentProxy.insertText("\n")
            },
            onNextKeyboard: { [weak self] in
                self?.advanceToNextInputMode()
            }
        )
        
        // Wire up Audio Recorder errors too
        audioRecorder.onError = { [weak self] errorMessage in
            self?.handleError(errorMessage)
        }
        
        let hostingController = UIHostingController(rootView: keyboardView)
        addChild(hostingController)
        view.addSubview(hostingController.view)
        
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hostingController.view.leftAnchor.constraint(equalTo: view.leftAnchor),
            hostingController.view.rightAnchor.constraint(equalTo: view.rightAnchor),
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        
        hostingController.didMove(toParent: self)
    }
    
    private func startRecording() {
        print("[Keyboard] Start Recording Requested")
        isRecording = true
        isCancelled = false  // Reset cancel flag
        
        if useDeepgram {
            print("[Keyboard] Starting Deepgram Stream...")
            deepgramService?.startStreaming()
            // Hook up audio recorder to deepgram
            audioRecorder.onAudioData = { [weak self] data in
                self?.deepgramService?.sendAudioData(data)
            }
            print("[Keyboard] Starting Audio Recorder...")
            audioRecorder.startRecording()
            
        } else if useLocal {
            // ...
            do {
                try localSpeechService?.startRecording()
            } catch {
                textDocumentProxy.insertText("[Error: Local Speech failed]")
            }
        } else {
            // Fallback to OpenAI File-based
            audioRecorder.startRecording()
        }
    }
    
    // State
    private var accumulatedTranscript = ""
    private var isCancelled = false
    private var pendingFinalTranscript = false  // Track if we're waiting for final transcript

    private func handleLiveTranscript(_ text: String) {
        // Ignore if cancelled
        if isCancelled {
            print("[Keyboard] Ignoring transcript - recording was cancelled")
            return
        }
        
        // Just for live feedback - we don't accumulate here anymore
        // The final ordered transcript comes from onFinalTranscript
        print("[Keyboard] Live transcript: \(text)")
    }
    
    private func handleError(_ message: String) {
        let errorMessage = "\n[Error: \(message)]"
        print("[Keyboard] Error encountered: \(message)")
        
        DispatchQueue.main.async { [weak self] in
            // Stop recording on error so user isn't stuck
            self?.stopRecording()
            
            // Insert error into text field so user can see it
            self?.textDocumentProxy.insertText(errorMessage)
        }
    }
    
    // Called when Deepgram stream ends with the complete, ordered transcript
    private func handleFinalTranscript(_ fullText: String) {
        if isCancelled {
            print("[Keyboard] Ignoring final transcript - recording was cancelled")
            return
        }
        
        print("[Keyboard] Final transcript received: \(fullText)")
        pendingFinalTranscript = false
        formatAndInsert(fullText)
    }
    
    private func stopRecording() {
        print("[Keyboard] Stop Recording Requested")
        isRecording = false
        
        // Stop Audio & Streaming
        audioRecorder.onAudioData = nil // Stop receiving audio data immediately
        
        if useDeepgram {
            print("[Keyboard] Stopping Audio Recorder...")
            audioRecorder.stopRecording { _ in }
            print("[Keyboard] Stopping Deepgram Stream...")
            // stopStreaming() will trigger onFinalTranscript with the complete ordered text
            deepgramService?.stopStreaming()
            // The processing will happen in handleFinalTranscript
        } else if useLocal {
            localSpeechService?.stopRecording()
            // Process local transcript
            if !accumulatedTranscript.isEmpty {
                formatAndInsert(accumulatedTranscript)
                accumulatedTranscript = ""
            }
        } else {
            // OpenAI File-based (already handles paste in callback)
            audioRecorder.stopRecording { [weak self] data in
                guard let data = data, !data.isEmpty else { return }
                self?.transcribeWithOpenAI(data)
            }
        }
    }
    
    private func cancelRecording() {
        print("[Keyboard] Cancel Recording Requested")
        isRecording = false
        isCancelled = true  // Set cancel flag to ignore late transcripts
        
        // Stop Audio & Streaming without processing
        audioRecorder.onAudioData = nil
        
        if useDeepgram {
            audioRecorder.stopRecording { _ in }
            deepgramService?.stopStreaming()
        } else if useLocal {
            localSpeechService?.stopRecording()
        } else {
            audioRecorder.stopRecording { _ in }
        }
        
        // Discard accumulated transcript
        accumulatedTranscript = ""
        
        // Reset processing state
        audioRecorder.isProcessing = false
        
        print("[Keyboard] Recording cancelled - transcript discarded")
    }
    
    private func transcribeWithOpenAI(_ data: Data) {
        transcriptionService?.transcribe(audioData: data) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let text):
                    self?.formatAndInsert(text)
                case .failure(let error):
                    self?.textDocumentProxy.insertText("[Error: \(error.localizedDescription)]")
                }
            }
        }
    }
    
    private func formatAndInsert(_ text: String) {
        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else { return }
        
        guard let core = jarvisCore else {
            // No API key configured, insert raw text
            print("[Keyboard] No JarvisCore, inserting raw: \(trimmedText.prefix(30))...")
            textDocumentProxy.insertText(trimmedText)
            return
        }
        
        // Check if this is a Jarvis command
        let isCommand = isJarvisCommand(trimmedText)
        
        audioRecorder.isProcessing = true
        print("[Keyboard] Processing \(isCommand ? "COMMAND" : "DICTATION") with Gemini...")
        
        core.processText(trimmedText) { [weak self] result in
            DispatchQueue.main.async {
                self?.audioRecorder.isProcessing = false
                
                switch result {
                case .success(let formatted):
                    print("[Keyboard] Inserting Formatted: \(formatted.prefix(30))...")
                    self?.textDocumentProxy.insertText(formatted)
                case .failure(let error):
                    print("[Keyboard] AI Failed: \(error). Inserting Raw Text.")
                    self?.textDocumentProxy.insertText(trimmedText)
                }
            }
        }
    }
    
    private func isJarvisCommand(_ text: String) -> Bool {
        let pattern = "^(hey|hi|hello|okay)?\\s*jarvis"
        return text.lowercased().range(of: pattern, options: .regularExpression) != nil
    }
}
