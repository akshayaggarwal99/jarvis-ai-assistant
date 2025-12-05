import SwiftUI

@main
struct JarvisApp: App {
    // Initialize the AppConfig to ensure App Group is accessible
    init() {
        // In a real app, we might do some setup here
        print("Jarvis iOS App Launching...")
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
