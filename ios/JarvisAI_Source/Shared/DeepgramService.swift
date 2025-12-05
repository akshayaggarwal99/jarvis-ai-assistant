import Foundation

class DeepgramService: NSObject, URLSessionWebSocketDelegate {
    private let apiKey: String
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession!
    
    // Callbacks
    var onTranscript: ((String) -> Void)?
    var onFinalTranscript: ((String) -> Void)?  // Called when stream ends with full transcript
    var onError: ((Error) -> Void)?
    var onConnected: (() -> Void)?
    
    // Accumulate transcripts in order
    private var transcriptParts: [String] = []
    private var isStopping = false  // Track if we're in stopping state
    
    init(apiKey: String) {
        self.apiKey = apiKey
        super.init()
        self.urlSession = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue())
    }
    
    private var isStreaming = false
    
    func startStreaming() {
        isStreaming = true
        isStopping = false
        transcriptParts = []  // Reset transcript accumulator
        
        // Deepgram WebSocket URL with parameters
        // model=nova-2 is their fastest/best model
        // smart_format=true adds punctuation
        let urlString = "wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&encoding=linear16&sample_rate=16000"
        guard let url = URL(string: urlString) else { return }
        
        var request = URLRequest(url: url)
        request.setValue("Token \(apiKey)", forHTTPHeaderField: "Authorization")
        
        webSocketTask = urlSession.webSocketTask(with: request)
        webSocketTask?.resume()
        
        receiveMessage()
    }
    
    func stopStreaming() {
        print("[Deepgram] stopStreaming called. Parts so far: \(transcriptParts.count)")
        isStreaming = false
        isStopping = true  // Mark that we're stopping - next transcript should trigger final
        
        print("[Deepgram] Sending Close Stream message...")
        let closeMessage = Data() // Empty data signals end of audio
        let message = URLSessionWebSocketTask.Message.data(closeMessage)
        webSocketTask?.send(message) { error in
            if let error = error {
                print("[Deepgram] Error sending close message: \(error)")
            }
        }
        
        // If we already have transcripts, send them now
        // Otherwise, wait for final transcript to arrive in handleResponse
        if !transcriptParts.isEmpty {
            sendFinalTranscript()
        }
        
        // Set a timeout to force close and send whatever we have
        let taskToClose = webSocketTask
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            print("[Deepgram] Timeout reached. Force closing.")
            
            // Send final transcript if not sent yet
            if self?.isStopping == true {
                self?.sendFinalTranscript()
            }
            
            taskToClose?.cancel(with: .normalClosure, reason: nil)
            if self?.webSocketTask === taskToClose {
                self?.webSocketTask = nil
            }
        }
    }
    
    private func sendFinalTranscript() {
        guard isStopping else { return }
        isStopping = false  // Only send once
        
        let fullTranscript = transcriptParts.joined(separator: " ")
        print("[Deepgram] Sending final transcript: \(fullTranscript)")
        
        if !fullTranscript.isEmpty {
            DispatchQueue.main.async {
                self.onFinalTranscript?(fullTranscript)
            }
        }
    }
    
    func sendAudioData(_ data: Data) {
        guard isStreaming, let task = webSocketTask, task.state == .running else { return }
        
        let message = URLSessionWebSocketTask.Message.data(data)
        task.send(message) { [weak self] error in
            if let error = error {
                // Ignore errors if we are stopping or if the socket is closed
                if self?.isStreaming == true && self?.webSocketTask?.state == .running {
                    print("[Deepgram] Send Error: \(error.localizedDescription)")
                }
            }
        }
    }
    
    private func receiveMessage() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .failure(let error):
                self?.onError?(error)
            case .success(let message):
                switch message {
                case .string(let text):
                    self?.handleResponse(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self?.handleResponse(text)
                    }
                @unknown default:
                    break
                }
                
                // Continue receiving messages
                self?.receiveMessage()
            }
        }
    }
    
    private func handleResponse(_ jsonString: String) {
        guard let data = jsonString.data(using: .utf8) else { return }
        
        do {
            if let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
               let channel = json["channel"] as? [String: Any],
               let alternatives = channel["alternatives"] as? [[String: Any]],
               let firstAlt = alternatives.first,
               let transcript = firstAlt["transcript"] as? String,
               !transcript.isEmpty {
                
                let isFinal = json["is_final"] as? Bool ?? false
                
                if isFinal {
                    // Append to our ordered list
                    self.transcriptParts.append(transcript)
                    print("[Deepgram] Final Transcript [\(self.transcriptParts.count)]: \(transcript)")
                    
                    // Send live update for UI feedback
                    DispatchQueue.main.async {
                        self.onTranscript?(transcript)
                    }
                    
                    // If we're stopping, this might be the last transcript - send final
                    if self.isStopping {
                        // Small delay to allow any more transcripts to arrive
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                            self.sendFinalTranscript()
                        }
                    }
                }
            }
        } catch {
            print("Deepgram JSON parse error: \(error)")
        }
    }
    
    // MARK: - URLSessionWebSocketDelegate
    
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
        print("[Deepgram] WebSocket Connected!")
        DispatchQueue.main.async {
            self.onConnected?()
        }
    }
    
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        print("[Deepgram] WebSocket Closed. Code: \(closeCode)")
        if let reason = reason, let reasonString = String(data: reason, encoding: .utf8) {
            print("[Deepgram] Reason: \(reasonString)")
        }
    }
    
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            print("[Deepgram] Connection Error: \(error.localizedDescription)")
            self.onError?(error)
        }
    }
}
