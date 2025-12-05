import Foundation

class SecureAPIService {
    static let shared = SecureAPIService()
    
    private let defaults = UserDefaults(suiteName: AppConfig.appGroupId)
    
    private init() {}
    
    func getOpenAIKey() -> String? {
        return defaults?.string(forKey: AppConfig.Keys.openAIApiKey)
    }
    
    func setOpenAIKey(_ key: String) {
        defaults?.set(key, forKey: AppConfig.Keys.openAIApiKey)
    }
    
    func getDeepgramKey() -> String? {
        return defaults?.string(forKey: AppConfig.Keys.deepgramApiKey)
    }
    
    func setDeepgramKey(_ key: String) {
        defaults?.set(key, forKey: AppConfig.Keys.deepgramApiKey)
    }
    
    // Add other keys as needed
}
