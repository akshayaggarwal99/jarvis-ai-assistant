import SwiftUI

// MARK: - Jarvis Logo Shape (from SVG)
struct JarvisLogo: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        
        let scale = min(rect.width, rect.height) / 20
        let offsetX = (rect.width - 20 * scale) / 2
        let offsetY = (rect.height - 20 * scale) / 2
        
        // Top triangle
        path.move(to: CGPoint(x: offsetX + 15.98 * scale, y: offsetY + 5.82 * scale))
        path.addLine(to: CGPoint(x: offsetX + 10 * scale, y: offsetY + 2.5 * scale))
        path.addLine(to: CGPoint(x: offsetX + 4.02 * scale, y: offsetY + 5.82 * scale))
        path.addLine(to: CGPoint(x: offsetX + 7.82 * scale, y: offsetY + 7.93 * scale))
        path.addCurve(
            to: CGPoint(x: offsetX + 10 * scale, y: offsetY + 7 * scale),
            control1: CGPoint(x: offsetX + 8.37 * scale, y: offsetY + 7.36 * scale),
            control2: CGPoint(x: offsetX + 9.14 * scale, y: offsetY + 7 * scale)
        )
        path.addCurve(
            to: CGPoint(x: offsetX + 12.17 * scale, y: offsetY + 7.93 * scale),
            control1: CGPoint(x: offsetX + 10.86 * scale, y: offsetY + 7 * scale),
            control2: CGPoint(x: offsetX + 11.63 * scale, y: offsetY + 7.36 * scale)
        )
        path.closeSubpath()
        
        // Center circle
        let centerX = offsetX + 10 * scale
        let centerY = offsetY + 10 * scale
        let radius = 1.5 * scale
        path.addEllipse(in: CGRect(x: centerX - radius, y: centerY - radius, width: radius * 2, height: radius * 2))
        
        // Left polygon
        path.move(to: CGPoint(x: offsetX + 9.25 * scale, y: offsetY + 17.08 * scale))
        path.addLine(to: CGPoint(x: offsetX + 3.25 * scale, y: offsetY + 13.75 * scale))
        path.addLine(to: CGPoint(x: offsetX + 3.25 * scale, y: offsetY + 7.11 * scale))
        path.addLine(to: CGPoint(x: offsetX + 7.1 * scale, y: offsetY + 9.24 * scale))
        path.addCurve(
            to: CGPoint(x: offsetX + 7 * scale, y: offsetY + 10 * scale),
            control1: CGPoint(x: offsetX + 7.03 * scale, y: offsetY + 9.49 * scale),
            control2: CGPoint(x: offsetX + 7 * scale, y: offsetY + 9.74 * scale)
        )
        path.addCurve(
            to: CGPoint(x: offsetX + 9.25 * scale, y: offsetY + 12.91 * scale),
            control1: CGPoint(x: offsetX + 7 * scale, y: offsetY + 11.4 * scale),
            control2: CGPoint(x: offsetX + 7.96 * scale, y: offsetY + 12.57 * scale)
        )
        path.closeSubpath()
        
        // Right polygon
        path.move(to: CGPoint(x: offsetX + 10.75 * scale, y: offsetY + 17.08 * scale))
        path.addLine(to: CGPoint(x: offsetX + 10.75 * scale, y: offsetY + 12.9 * scale))
        path.addCurve(
            to: CGPoint(x: offsetX + 13 * scale, y: offsetY + 10 * scale),
            control1: CGPoint(x: offsetX + 12.04 * scale, y: offsetY + 12.57 * scale),
            control2: CGPoint(x: offsetX + 13 * scale, y: offsetY + 11.4 * scale)
        )
        path.addCurve(
            to: CGPoint(x: offsetX + 12.9 * scale, y: offsetY + 9.24 * scale),
            control1: CGPoint(x: offsetX + 13 * scale, y: offsetY + 9.74 * scale),
            control2: CGPoint(x: offsetX + 12.97 * scale, y: offsetY + 9.49 * scale)
        )
        path.addLine(to: CGPoint(x: offsetX + 16.75 * scale, y: offsetY + 7.1 * scale))
        path.addLine(to: CGPoint(x: offsetX + 16.75 * scale, y: offsetY + 13.74 * scale))
        path.closeSubpath()
        
        return path
    }
}

// MARK: - Main Content View
struct ContentView: View {
    @State private var apiKey: String = ""
    @State private var deepgramKey: String = ""
    @State private var testText: String = ""
    @State private var isPulsing: Bool = false
    @State private var showSetup: Bool = false
    
    @Environment(\.colorScheme) var colorScheme
    
    let sharedDefaults = UserDefaults(suiteName: AppConfig.appGroupId)
    
    private var accentBlue: Color {
        Color(red: 0.35, green: 0.55, blue: 1.0)
    }
    
    private var accentGreen: Color {
        Color(red: 0.3, green: 0.8, blue: 0.5)
    }
    
    // Check if API is configured
    private var isConfigured: Bool {
        !apiKey.isEmpty
    }
    
    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 24) {
                // Hero
                heroSection
                    .padding(.top, 16)
                
                // Main text area
                textAreaSection
                
                // Setup (collapsible) or API keys
                if showSetup {
                    setupSection
                }
                
                // API Keys
                apiSection
                
                // Footer
                footerSection
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 40)
        }
        .background(Color(UIColor.systemGroupedBackground))
        .onAppear {
            loadSettings()
        }
        .onChange(of: apiKey) { saveApiKey($0) }
        .onChange(of: deepgramKey) { saveDeepgramKey($0) }
    }
    
    // MARK: - Hero Section
    private var heroSection: some View {
        VStack(spacing: 12) {
            // Jarvis Logo - adaptive color
            ZStack {
                Circle()
                    .stroke(Color.primary.opacity(0.2), lineWidth: 2)
                    .frame(width: 80, height: 80)
                    .scaleEffect(isPulsing ? 1.15 : 1.0)
                    .opacity(isPulsing ? 0.0 : 0.5)
                
                Circle()
                    .fill(Color.primary)
                    .frame(width: 64, height: 64)
                    .shadow(color: Color.primary.opacity(0.15), radius: 10, y: 3)
                
                JarvisLogo()
                    .fill(Color(UIColor.systemBackground))
                    .frame(width: 28, height: 28)
            }
            .onAppear {
                withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: false)) {
                    isPulsing = true
                }
            }
            
            Text("Jarvis AI")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(.primary)
            
            Text("Your Voice, Supercharged")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.secondary)
        }
    }
    
    // MARK: - Text Area Section
    private var textAreaSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TRY IT OUT")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.secondary)
                .padding(.leading, 4)
            
            ZStack(alignment: .topLeading) {
                TextEditor(text: $testText)
                    .font(.system(size: 16))
                    .frame(height: 120)
                    .scrollContentBackground(.hidden)
                
                if testText.isEmpty {
                    Text("Switch to Jarvis Keyboard and tap the mic...")
                        .font(.system(size: 16))
                        .foregroundColor(Color(UIColor.placeholderText))
                        .padding(.top, 8)
                        .padding(.leading, 5)
                        .allowsHitTesting(false)
                }
            }
            .padding(14)
            .background(Color(UIColor.secondarySystemGroupedBackground))
            .cornerRadius(12)
        }
    }
    
    // MARK: - Setup Section
    private var setupSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(spacing: 0) {
                SetupRow(number: 1, text: "Settings → General → Keyboard")
                Divider().padding(.leading, 40)
                SetupRow(number: 2, text: "Keyboards → Add New Keyboard")
                Divider().padding(.leading, 40)
                SetupRow(number: 3, text: "Select \"JarvisKeyboard\"")
                Divider().padding(.leading, 40)
                SetupRow(number: 4, text: "Allow Full Access")
            }
            
            Button(action: openSettings) {
                HStack {
                    Text("Open Settings")
                        .font(.system(size: 15, weight: .semibold))
                    Spacer()
                    Image(systemName: "arrow.right")
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(accentBlue)
                .cornerRadius(10)
            }
        }
        .padding(14)
        .background(Color(UIColor.secondarySystemGroupedBackground))
        .cornerRadius(12)
    }
    
    // MARK: - API Section
    private var apiSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header with setup toggle
            HStack {
                Text("CONFIGURATION")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.secondary)
                
                Spacer()
                
                Button(action: { withAnimation(.spring(response: 0.3)) { showSetup.toggle() }}) {
                    HStack(spacing: 4) {
                        Image(systemName: "keyboard")
                            .font(.system(size: 11))
                        Text(showSetup ? "Hide Setup" : "Keyboard Setup")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(accentBlue)
                }
            }
            .padding(.leading, 4)
            
            VStack(spacing: 12) {
                APIInputField(
                    title: "Gemini API Key",
                    placeholder: "AIza...",
                    text: $apiKey,
                    icon: "brain"
                )
                
                APIInputField(
                    title: "Deepgram API Key (Optional)",
                    placeholder: "Enter key...",
                    text: $deepgramKey,
                    icon: "waveform"
                )
            }
            .padding(14)
            .background(Color(UIColor.secondarySystemGroupedBackground))
            .cornerRadius(12)
            
            // Status
            if isConfigured {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(accentGreen)
                        .font(.system(size: 12))
                    Text("Ready to use")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(accentGreen)
                }
                .padding(.leading, 4)
            }
        }
    }
    
    // MARK: - Footer
    private var footerSection: some View {
        VStack(spacing: 6) {
            Text("Built with ❤️ by Akshay")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.secondary)
            
            Button(action: openGitHub) {
                Text("Open Source • Free Forever")
                    .font(.system(size: 11))
                    .foregroundColor(accentBlue)
            }
        }
        .padding(.top, 12)
    }
    
    private func openGitHub() {
        if let url = URL(string: "https://github.com/AkshayAggarwal99/jarvis-ai-assistant") {
            UIApplication.shared.open(url)
        }
    }
    
    // MARK: - Helpers
    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
    
    private func saveApiKey(_ key: String) {
        sharedDefaults?.set(key, forKey: "openai_api_key")
    }
    
    private func saveDeepgramKey(_ key: String) {
        sharedDefaults?.set(key, forKey: "deepgram_api_key")
    }
    
    private func loadSettings() {
        if let key = sharedDefaults?.string(forKey: "openai_api_key") {
            self.apiKey = key
        }
        if let key = sharedDefaults?.string(forKey: "deepgram_api_key") {
            self.deepgramKey = key
        }
    }
}

// MARK: - Setup Row
struct SetupRow: View {
    let number: Int
    let text: String
    
    private var accentBlue: Color {
        Color(red: 0.35, green: 0.55, blue: 1.0)
    }
    
    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(accentBlue.opacity(0.12))
                    .frame(width: 28, height: 28)
                
                Text("\(number)")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundColor(accentBlue)
            }
            
            Text(text)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.primary)
            
            Spacer()
        }
        .padding(.vertical, 12)
    }
}

// MARK: - API Input Field
struct APIInputField: View {
    let title: String
    let placeholder: String
    @Binding var text: String
    let icon: String
    
    @State private var isSecure: Bool = true
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.secondary)
            }
            
            HStack {
                if isSecure {
                    SecureField(placeholder, text: $text)
                        .font(.system(size: 15, design: .monospaced))
                } else {
                    TextField(placeholder, text: $text)
                        .font(.system(size: 15, design: .monospaced))
                }
                
                Button(action: { isSecure.toggle() }) {
                    Image(systemName: isSecure ? "eye.slash" : "eye")
                        .foregroundColor(.secondary)
                        .font(.system(size: 14))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color(UIColor.tertiarySystemFill))
            .cornerRadius(10)
        }
    }
}

// MARK: - Preview
struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
