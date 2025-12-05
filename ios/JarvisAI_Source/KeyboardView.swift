import SwiftUI
import UIKit

struct KeyboardView: View {
    @ObservedObject var audioRecorder: AudioRecorder
    var onRecordStart: () -> Void
    var onRecordStop: () -> Void
    var onCancel: () -> Void
    var onReturn: () -> Void
    var onNextKeyboard: () -> Void
    
    @State private var waveformAmplitudes: [CGFloat] = Array(repeating: 0.15, count: 9)
    @State private var animationTimer: Timer?
    
    // Adaptive colors
    @Environment(\.colorScheme) var colorScheme
    
    // iOS keyboard background color
    private var backgroundColor: Color {
        if colorScheme == .dark {
            return Color(UIColor(red: 0.11, green: 0.11, blue: 0.12, alpha: 1.0))
        } else {
            return Color(UIColor(red: 0.82, green: 0.84, blue: 0.86, alpha: 1.0))
        }
    }
    
    private var primaryColor: Color {
        Color(UIColor.label)
    }
    
    private var secondaryColor: Color {
        Color(UIColor.secondaryLabel)
    }
    
    private var tertiaryColor: Color {
        Color(UIColor.tertiaryLabel)
    }
    
    private var accentBlue: Color {
        Color(red: 0.35, green: 0.55, blue: 1.0)
    }
    
    var body: some View {
        ZStack {
            backgroundColor
                .ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Main content area
                Spacer()
                
                // Center waveform/mic area
                centerContent
                
                Spacer()
                
                // Bottom action row
                bottomRow
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
            }
        }
        .frame(height: 240)
        .onAppear {
            startWaveformAnimation()
        }
        .onDisappear {
            animationTimer?.invalidate()
        }
    }
    
    // MARK: - Center Content
    @ViewBuilder
    private var centerContent: some View {
        VStack(spacing: 16) {
            if audioRecorder.isRecording || audioRecorder.isProcessing {
                // Waveform visualization (like the screenshot)
                waveformView
                
                // Status text
                Text(audioRecorder.isProcessing ? "Processing" : "Listening")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(primaryColor)
            } else {
                // Idle state - Tap to record
                idleMicButton
            }
        }
    }
    
    // MARK: - Waveform View (matching the screenshot style)
    private var waveformView: some View {
        HStack(spacing: 4) {
            ForEach(0..<9, id: \.self) { index in
                RoundedRectangle(cornerRadius: 2.5)
                    .fill(primaryColor)
                    .frame(width: 5, height: waveformHeight(for: index))
            }
        }
        .frame(height: 60)
        .onTapGesture {
            if audioRecorder.isRecording {
                onRecordStop()
            }
        }
    }
    
    private func waveformHeight(for index: Int) -> CGFloat {
        // Create the classic waveform shape - taller in middle, shorter on edges
        let baseHeights: [CGFloat] = [0.25, 0.4, 0.7, 0.9, 1.0, 0.9, 0.7, 0.4, 0.25]
        let amplitude = waveformAmplitudes[index]
        let baseHeight = baseHeights[index]
        
        if audioRecorder.isRecording {
            // Animate with random variation
            return max(8, baseHeight * amplitude * 60)
        } else {
            // Processing - gentle pulse
            return max(8, baseHeight * amplitude * 50)
        }
    }
    
    // MARK: - Idle Mic Button
    private var idleMicButton: some View {
        Button(action: onRecordStart) {
            VStack(spacing: 12) {
                // Jarvis logo icon - same tint as other icons
                ZStack {
                    Circle()
                        .fill(primaryColor)
                        .frame(width: 64, height: 64)
                        .shadow(color: primaryColor.opacity(0.2), radius: 8, y: 2)
                    
                    // Jarvis hexagonal waveform icon
                    JarvisLogoShape()
                        .fill(backgroundColor)
                        .frame(width: 28, height: 28)
                }
                
                Text("Tap to speak")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(secondaryColor)
            }
        }
    }
    
    // MARK: - Bottom Row
    private var bottomRow: some View {
        HStack {
            // Cancel button (X) - left, only when recording/processing
            if audioRecorder.isRecording || audioRecorder.isProcessing {
                Button(action: onCancel) {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 44, height: 44)
                        .background(
                            Circle()
                                .fill(Color(UIColor.systemGray))
                        )
                }
            }
            
            Spacer()
            
            // Done/Send button (checkmark) - right
            Button(action: {
                if audioRecorder.isRecording {
                    onRecordStop()
                } else {
                    onReturn()
                }
            }) {
                Image(systemName: "checkmark")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(
                        Circle()
                            .fill(primaryColor)
                    )
            }
        }
    }
    
    // MARK: - Animation
    private func startWaveformAnimation() {
        animationTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { _ in
            if audioRecorder.isRecording {
                withAnimation(.easeInOut(duration: 0.08)) {
                    for i in 0..<waveformAmplitudes.count {
                        waveformAmplitudes[i] = CGFloat.random(in: 0.4...1.0)
                    }
                }
            } else if audioRecorder.isProcessing {
                withAnimation(.easeInOut(duration: 0.15)) {
                    for i in 0..<waveformAmplitudes.count {
                        waveformAmplitudes[i] = CGFloat.random(in: 0.3...0.7)
                    }
                }
            } else {
                // Reset to idle
                withAnimation(.easeInOut(duration: 0.3)) {
                    waveformAmplitudes = Array(repeating: 0.15, count: 9)
                }
            }
        }
    }
}

// MARK: - Jarvis Logo Shape (hexagonal waveform from SVG)
struct JarvisLogoShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        
        let scale = min(rect.width, rect.height) / 20
        let offsetX = (rect.width - 20 * scale) / 2
        let offsetY = (rect.height - 20 * scale) / 2
        
        // Top triangle (pointing up)
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

// MARK: - Preview
struct KeyboardView_Previews: PreviewProvider {
    static var previews: some View {
        KeyboardView(
            audioRecorder: AudioRecorder(),
            onRecordStart: {},
            onRecordStop: {},
            onCancel: {},
            onReturn: {},
            onNextKeyboard: {}
        )
        .previewLayout(.sizeThatFits)
    }
}
