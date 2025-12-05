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
    @State private var showAPISection: Bool = false
    @State private var keyboardEnabled: Bool = false
    
    @Environment(\.colorScheme) var colorScheme
    
    let sharedDefaults = UserDefaults(suiteName: AppConfig.appGroupId)
    
    // Adaptive colors
    private var accentBlue: Color {
        Color(red: 0.35, green: 0.55, blue: 1.0)
    }
    
    private var accentGreen: Color {
        Color(red: 0.3, green: 0.8, blue: 0.5)
    }
    
    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 28) {
                // MARK: - Hero Section
                heroSection
                    .padding(.top, 20)
                
                // MARK: - Try It Out
                playgroundSection
                
                // MARK: - Setup Guide
                setupSection
                
                // MARK: - API Keys
                apiSection
                
                // MARK: - Footer
                footerSection
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 40)
        }
        .background(Color(UIColor.systemGroupedBackground))
        .onAppear {
            loadSettings()
            checkKeyboardStatus()
        }
        .onChange(of: apiKey) { saveApiKey($0) }
        .onChange(of: deepgramKey) { saveDeepgramKey($0) }
    }
    
    // MARK: - Hero Section
    private var heroSection: some View {
        VStack(spacing: 16) {
            // Jarvis Logo with animation
            ZStack {
                // Pulsing ring
                Circle()
                    .stroke(accentBlue.opacity(0.3), lineWidth: 2)
                    .frame(width: 90, height: 90)
                    .scaleEffect(isPulsing ? 1.2 : 1.0)
                    .opacity(isPulsing ? 0.0 : 0.6)
                
                // Main circle
                Circle()
                    .fill(accentBlue)
                    .frame(width: 72, height: 72)
                    .shadow(color: accentBlue.opacity(0.3), radius: 12, y: 4)
                
                // Jarvis logo
                JarvisLogo()
                    .fill(.white)
                    .frame(width: 32, height: 32)
            }
            .onAppear {
                withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: false)) {
                    isPulsing = true
                }
            }
            
            // Title
            Text("Jarvis AI")
                .font(.system(size: 32, weight: .bold, design: .rounded))
                .foregroundColor(.primary)
            
            // Tagline
            Text("Your Voice, Supercharged")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.secondary)
            
            // Status badge
            HStack(spacing: 8) {
                Circle()
                    .fill(keyboardEnabled ? accentGreen : Color.secondary.opacity(0.5))
                    .frame(width: 8, height: 8)
                
                Text(keyboardEnabled ? "Keyboard Active" : "Setup Required")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(keyboardEnabled ? accentGreen : .secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(Color(UIColor.tertiarySystemFill))
            )
        }
    }
    
    // MARK: - Playground Section
    private var playgroundSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("TRY IT OUT", systemImage: "text.cursor")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
            
            ZStack(alignment: .topLeading) {
                TextEditor(text: $testText)
                    .font(.system(size: 16))
                    .frame(height: 100)
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
        .padding(16)
        .background(Color(UIColor.secondarySystemGroupedBackground))
        .cornerRadius(16)
    }
    
    // MARK: - Setup Section
    private var setupSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("SETUP GUIDE", systemImage: "keyboard")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)
            
            VStack(spacing: 0) {
                SetupRow(number: 1, text: "Open Settings → General → Keyboard")
                Divider().padding(.leading, 44)
                SetupRow(number: 2, text: "Tap Keyboards → Add New Keyboard")
                Divider().padding(.leading, 44)
                SetupRow(number: 3, text: "Select \"JarvisKeyboard\"")
                Divider().padding(.leading, 44)
                SetupRow(number: 4, text: "Enable \"Allow Full Access\"")
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
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
                .background(accentBlue)
                .cornerRadius(12)
            }
            .padding(.top, 4)
        }
        .padding(16)
        .background(Color(UIColor.secondarySystemGroupedBackground))
        .cornerRadius(16)
    }
    
    // MARK: - API Section
    private var apiSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button(action: { withAnimation(.spring(response: 0.3)) { showAPISection.toggle() }}) {
                HStack {
                    Label("API KEYS", systemImage: "key.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)
                    
                    Spacer()
                    
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)
                        .rotationEffect(.degrees(showAPISection ? 180 : 0))
                }
            }
            
            if showAPISection {
                VStack(spacing: 14) {
                    APIInputField(
                        title: "OpenAI API Key",
                        placeholder: "sk-...",
                        text: $apiKey,
                        icon: "brain"
                    )
                    
                    APIInputField(
                        title: "Deepgram API Key",
                        placeholder: "Enter key...",
                        text: $deepgramKey,
                        icon: "waveform"
                    )
                    
                    HStack(spacing: 6) {
                        Image(systemName: apiKey.isEmpty ? "info.circle" : "checkmark.circle.fill")
                            .foregroundColor(apiKey.isEmpty ? .secondary : accentGreen)
                            .font(.system(size: 12))
                        
                        Text(apiKey.isEmpty ? "API key required for AI features" : "API configured")
                            .font(.system(size: 12))
                            .foregroundColor(apiKey.isEmpty ? .secondary : accentGreen)
                        
                        Spacer()
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(16)
        .background(Color(UIColor.secondarySystemGroupedBackground))
        .cornerRadius(16)
    }
    
    // MARK: - Footer
    private var footerSection: some View {
        VStack(spacing: 8) {
            Text("Built with ❤️ by Akshay")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.secondary)
            
            Text("Open Source • Free Forever")
                .font(.system(size: 11))
                .foregroundColor(Color(UIColor.tertiaryLabel))
        }
        .padding(.top, 16)
    }
    
    // MARK: - Helpers
    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
    
    private func checkKeyboardStatus() {
        if let enabled = sharedDefaults?.bool(forKey: "keyboard_enabled") {
            keyboardEnabled = enabled
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
