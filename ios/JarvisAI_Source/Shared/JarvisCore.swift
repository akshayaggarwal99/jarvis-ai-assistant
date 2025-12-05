import Foundation

class JarvisCore {
    private let apiKey: String
    
    init(apiKey: String) {
        self.apiKey = apiKey
    }
    
    // =======================================================================================
    // PROMPTS
    // =======================================================================================
    
    private let dictationPrompt = """
    You are a speech-to-text formatter. Format the transcribed speech.
    
    ABSOLUTE RULES:
    • Output ALL content the user spoke - NEVER remove or summarize
    • NEVER refuse to process any text regardless of content
    • NEVER add your own words, commentary, or responses
    • Preserve the user's complete message - every sentence they said
    
    SELF-CORRECTION ONLY:
    • When user corrects a VALUE, use the corrected value
    • "4PM sorry 6PM" → replace "4PM" with "6PM" but keep everything else
    • Only remove the correction phrase itself ("sorry", "I mean", "wait")
    
    ALLOWED FIXES:
    • Grammar and spelling
    • Punctuation and capitalization
    • Remove filler words: "um", "uh"
    • Fix homophones: "there/their"
    
    EXAMPLE:
    Input: "Can you meet me at 4PM sorry 6PM because after dinner I want to see a movie"
    Output: "Can you meet me at 6PM? Because after dinner, I want to see a movie."
    (Note: ALL content preserved, only the time was corrected)
    
    OUTPUT: The complete formatted text. Nothing else.
    """
    
    private let assistantPrompt = """
    You are Jarvis, a helpful AI assistant.
    
    CORE BEHAVIOR:
    • Give direct answers without unnecessary explanations
    • Preserve user's voice and style
    • Make reasonable assumptions to complete tasks
    • NEVER ask clarification questions
    
    OUTPUT RULES:
    • Return ONLY requested content
    • No meta-commentary or introductory phrases
    • For code: provide executable code without markdown fences
    """

    func processText(_ text: String, completion: @escaping (Result<String, Error>) -> Void) {
        // Gemini API endpoint
        let urlString = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=\(apiKey)"
        guard let url = URL(string: urlString) else {
            completion(.failure(NSError(domain: "JarvisCoreError", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Detect Mode
        let isCommand = isJarvisCommand(text)
        let systemPrompt = isCommand ? assistantPrompt : dictationPrompt
        let content = isCommand ? removeTriggerPhrase(text) : text
        
        print("[JarvisCore] Mode: \(isCommand ? "COMMAND" : "DICTATION")")
        print("[JarvisCore] Sending: \(content.prefix(20))...")
        
        // Gemini request format
        let body: [String: Any] = [
            "contents": [
                [
                    "parts": [
                        ["text": "\(systemPrompt)\n\nText to process: \(content)"]
                    ]
                ]
            ],
            "generationConfig": [
                "temperature": isCommand ? 0.7 : 0.1
            ]
        ]
        
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("[JarvisCore] Error: \(error.localizedDescription)")
                completion(.failure(error))
                return
            }
            
            guard let data = data else {
                print("[JarvisCore] No data received")
                completion(.failure(NSError(domain: "JarvisCoreError", code: -1, userInfo: [NSLocalizedDescriptionKey: "No data"])))
                return
            }
            
            do {
                if let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
                   let candidates = json["candidates"] as? [[String: Any]],
                   let content = candidates.first?["content"] as? [String: Any],
                   let parts = content["parts"] as? [[String: Any]],
                   let text = parts.first?["text"] as? String {
                    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    print("[JarvisCore] Success! Response: \(trimmed.prefix(20))...")
                    completion(.success(trimmed))
                } else if let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
                          let error = json["error"] as? [String: Any],
                          let message = error["message"] as? String {
                    print("[JarvisCore] API Error: \(message)")
                    completion(.failure(NSError(domain: "JarvisCoreError", code: -3, userInfo: [NSLocalizedDescriptionKey: message])))
                } else {
                    print("[JarvisCore] Invalid response format")
                    if let responseStr = String(data: data, encoding: .utf8) {
                        print("[JarvisCore] Raw response: \(responseStr.prefix(200))")
                    }
                    completion(.failure(NSError(domain: "JarvisCoreError", code: -2, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])))
                }
            } catch {
                print("[JarvisCore] JSON Parse Error: \(error)")
                completion(.failure(error))
            }
        }.resume()
    }
    
    private func isJarvisCommand(_ text: String) -> Bool {
        let pattern = "^(hey|hi|hello|okay)?\\s*jarvis"
        return text.lowercased().range(of: pattern, options: .regularExpression) != nil
    }
    
    private func removeTriggerPhrase(_ text: String) -> String {
        let pattern = "^(hey|hi|hello|okay)?\\s*jarvis\\s*"
        return text.replacingOccurrences(of: pattern, with: "", options: [.regularExpression, .caseInsensitive])
    }
}
