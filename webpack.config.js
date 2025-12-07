const path = require('path');
const fs = require('fs');

// Simple plugin to copy overlay.html and resources
class CopyAssetsPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopyAssetsPlugin', () => {
      // Copy overlay.html
      const htmlSrc = path.join(__dirname, 'src', 'overlay.html');
      const htmlDest = path.join(__dirname, 'dist', 'overlay.html');
      if (fs.existsSync(htmlSrc)) {
        fs.copyFileSync(htmlSrc, htmlDest);
      }
      
      // Copy analysis-overlay.html
      const analysisOverlaySrc = path.join(__dirname, 'src', 'analysis-overlay.html');
      const analysisOverlayDest = path.join(__dirname, 'dist', 'analysis-overlay.html');
      if (fs.existsSync(analysisOverlaySrc)) {
        fs.copyFileSync(analysisOverlaySrc, analysisOverlayDest);
      }
      
      // Copy waveform.html
      const waveformSrc = path.join(__dirname, 'src', 'waveform.html');
      const waveformDest = path.join(__dirname, 'dist', 'waveform.html');
      if (fs.existsSync(waveformSrc)) {
        fs.copyFileSync(waveformSrc, waveformDest);
      }

      // Copy dashboard.html
      const dashboardSrc = path.join(__dirname, 'src', 'dashboard.html');
      const dashboardDest = path.join(__dirname, 'dist', 'dashboard.html');
      if (fs.existsSync(dashboardSrc)) {
        fs.copyFileSync(dashboardSrc, dashboardDest);
      }

      // Copy React dashboard.html
      const dashboardReactSrc = path.join(__dirname, 'src', 'dashboard-react.html');
      const dashboardReactDest = path.join(__dirname, 'dist', 'dashboard-react.html');
      if (fs.existsSync(dashboardReactSrc)) {
        fs.copyFileSync(dashboardReactSrc, dashboardReactDest);
      }

      // Copy Jarvis logo (SVG)
      const logoSrc = path.join(__dirname, 'assets', 'jarvis-logo.svg');
      const logoDest = path.join(__dirname, 'dist', 'jarvis-logo.svg');
      if (fs.existsSync(logoSrc)) {
        fs.copyFileSync(logoSrc, logoDest);
      }

      // Copy Jarvis logo (PNG) - high resolution for menu bar
      const logoPngSrc = path.join(__dirname, 'assets', 'jarvis-logo.png');
      const logoPngDest = path.join(__dirname, 'dist', 'jarvis-logo.png');
      if (fs.existsSync(logoPngSrc)) {
        fs.copyFileSync(logoPngSrc, logoPngDest);
      }

      // Copy sound assets
      const soundsDir = path.join(__dirname, 'src', 'assets', 'sounds');
      const soundsDestDir = path.join(__dirname, 'dist', 'assets', 'sounds');
      if (fs.existsSync(soundsDir)) {
        // Create destination directory if it doesn't exist
        if (!fs.existsSync(soundsDestDir)) {
          fs.mkdirSync(soundsDestDir, { recursive: true });
        }
        
        // Copy all sound files
        const soundFiles = fs.readdirSync(soundsDir);
        soundFiles.forEach(file => {
          if (file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('.aiff')) {
            const srcFile = path.join(soundsDir, file);
            const destFile = path.join(soundsDestDir, file);
            fs.copyFileSync(srcFile, destFile);
            console.log(`Copied sound file: ${file}`);
          }
        });
      }

      // Copy native modules
      const entitlementsPath = path.join(__dirname, 'certificates', 'entitlements.mac.plist');
      
      const fnKeySrc = path.join(__dirname, 'build', 'Release', 'fn_key_monitor.node');
      const fnKeyDest = path.join(__dirname, 'dist', 'fn_key_monitor.node');
      if (fs.existsSync(fnKeySrc)) {
        fs.copyFileSync(fnKeySrc, fnKeyDest);
        // Try to sign the native module to avoid SIGKILL
        try {
          const { execSync } = require('child_process');
          if (fs.existsSync(entitlementsPath)) {
            execSync(`codesign --deep --force --sign - --entitlements "${entitlementsPath}" "${fnKeyDest}"`, { cwd: __dirname });
            console.log('✅ Signed fn_key_monitor.node');
          } else {
            console.log('⚠️ Entitlements file not found, skipping signing for fn_key_monitor.node');
          }
        } catch (e) {
          console.log('⚠️ Failed to sign fn_key_monitor.node:', e.message);
        }
      }
      
      const audioSrc = path.join(__dirname, 'build', 'Release', 'audio_capture.node');
      const audioDest = path.join(__dirname, 'dist', 'audio_capture.node');
      if (fs.existsSync(audioSrc)) {
        fs.copyFileSync(audioSrc, audioDest);
        // Try to sign the native module to avoid SIGKILL
        try {
          const { execSync } = require('child_process');
          if (fs.existsSync(entitlementsPath)) {
            execSync(`codesign --deep --force --sign - --entitlements "${entitlementsPath}" "${audioDest}"`, { cwd: __dirname });
            console.log('✅ Signed audio_capture.node');
          } else {
            console.log('⚠️ Entitlements file not found, skipping signing for audio_capture.node');
          }
        } catch (e) {
          console.log('⚠️ Failed to sign audio_capture.node:', e.message);
        }
      }
      
      const typingMonitorSrc = path.join(__dirname, 'build', 'Release', 'typing_monitor.node');
      const typingMonitorDest = path.join(__dirname, 'dist', 'typing_monitor.node');
      if (fs.existsSync(typingMonitorSrc)) {
        fs.copyFileSync(typingMonitorSrc, typingMonitorDest);
        // Try to sign the native module to avoid SIGKILL
        try {
          const { execSync } = require('child_process');
          if (fs.existsSync(entitlementsPath)) {
            execSync(`codesign --deep --force --sign - --entitlements "${entitlementsPath}" "${typingMonitorDest}"`, { cwd: __dirname });
            console.log('✅ Signed typing_monitor.node');
          } else {
            console.log('⚠️ Entitlements file not found, skipping signing for typing_monitor.node');
          }
        } catch (e) {
          console.log('⚠️ Failed to sign typing_monitor.node:', e.message);
        }
      }
      
      const universalKeySrc = path.join(__dirname, 'build', 'Release', 'universal_key_monitor.node');
      const universalKeyDest = path.join(__dirname, 'dist', 'universal_key_monitor.node');
      if (fs.existsSync(universalKeySrc)) {
        fs.copyFileSync(universalKeySrc, universalKeyDest);
        // Try to sign the native module to avoid SIGKILL
        try {
          const { execSync } = require('child_process');
          if (fs.existsSync(entitlementsPath)) {
            execSync(`codesign --deep --force --sign - --entitlements "${entitlementsPath}" "${universalKeyDest}"`, { cwd: __dirname });
            console.log('✅ Signed universal_key_monitor.node');
          } else {
            console.log('⚠️ Entitlements file not found, skipping signing for universal_key_monitor.node');
          }
        } catch (e) {
          console.log('⚠️ Failed to sign universal_key_monitor.node:', e.message);
        }
      }
      
      // Copy suggestion.html
      const suggestionSrc = path.join(__dirname, 'src', 'suggestion.html');
      const suggestionDest = path.join(__dirname, 'dist', 'suggestion.html');
      if (fs.existsSync(suggestionSrc)) {
        fs.copyFileSync(suggestionSrc, suggestionDest);
      }

      // Copy high-res logo PNGs for menu bar icons
      const logoFiles = ['jarvis-logo.png', 'jarvis-logo-dark.png', 'jarvis-logo-light.png'];
      logoFiles.forEach(logoFile => {
        const logoSrc = path.join(__dirname, 'assets', logoFile);
        const logoDest = path.join(__dirname, 'dist', logoFile);
        if (fs.existsSync(logoSrc)) {
          fs.copyFileSync(logoSrc, logoDest);
        }
      });


      
      // Copy resources directory recursively
      const resourcesSrc = path.join(__dirname, 'resources');
      const resourcesDest = path.join(__dirname, 'dist', 'resources');
      if (fs.existsSync(resourcesSrc)) {
        this.copyDirRecursive(resourcesSrc, resourcesDest);
      }
    });
  }
  
  copyDirRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const items = fs.readdirSync(src);
    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      
      if (fs.statSync(srcPath).isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else {
        // Remove destination file if it exists to avoid permission issues
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        fs.copyFileSync(srcPath, destPath);
        // Preserve file permissions
        const stats = fs.statSync(srcPath);
        fs.chmodSync(destPath, stats.mode);
      }
    }
  }
}

module.exports = [
  // Main process
  {
    mode: 'production',
    target: 'electron-main',
    entry: './src/main.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'main.js'
    },
    devtool: 'source-map',
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              configFile: false,
              compilerOptions: {
                noEmit: false,
                skipLibCheck: true,
                strict: false,
                noImplicitAny: false
              }
            }
          },
          exclude: /node_modules/
        }
      ]
    },
    plugins: [new CopyAssetsPlugin()],
    externals: {
      'fn_key_monitor': 'commonjs ./fn_key_monitor.node',
      'typing_monitor': 'commonjs ./typing_monitor.node',
      'audio_capture': 'commonjs ./audio_capture.node',
      'universal_key_monitor': 'commonjs ./universal_key_monitor.node',
      '../../build/Release/fn_key_monitor.node': 'commonjs ../../build/Release/fn_key_monitor.node',
      '../../build/Release/audio_capture.node': 'commonjs ../../build/Release/audio_capture.node',
      '../../build/Release/typing_monitor.node': 'commonjs ../../build/Release/typing_monitor.node',
      // Exclude large packages to reduce bundle size
      'ffmpeg-static': 'commonjs ffmpeg-static',
      'fluent-ffmpeg': 'commonjs fluent-ffmpeg',
      '@google-cloud/storage': 'commonjs @google-cloud/storage',
      // Exclude problematic OpenTelemetry dependencies
      'require-in-the-middle': 'commonjs require-in-the-middle',
      '@opentelemetry/instrumentation': 'commonjs @opentelemetry/instrumentation',
      // Exclude LangChain to reduce bundle size
      '@langchain/core': 'commonjs @langchain/core',
      '@langchain/openai': 'commonjs @langchain/openai',
      '@langchain/langgraph': 'commonjs @langchain/langgraph',
      // Exclude local Whisper / transformers.js packages (native modules)
      '@xenova/transformers': 'commonjs @xenova/transformers',
      'onnxruntime-node': 'commonjs onnxruntime-node',
      'sharp': 'commonjs sharp',
      'whisper-node-addon': 'commonjs whisper-node-addon'
    },
    node: {
      __dirname: false,
      __filename: false
    }
  },
  // Preload script
  {
    mode: 'development',
    target: 'electron-preload',
    entry: './src/preload.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'preload.js'
    },
    devtool: 'source-map',
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              configFile: false,
              compilerOptions: {
                noEmit: false,
                skipLibCheck: true,
                strict: false,
                noImplicitAny: false
              }
            }
          },
          exclude: /node_modules/
        }
      ]
    }
  },
  // React Dashboard
  {
    mode: 'development',
    target: 'web',
    entry: './src/index.tsx',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'index.js'
    },
    devtool: 'source-map',
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
      fallback: {
        "process": false,
        "util": false,
        "path": false,
        "fs": false
      }
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          use: {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              configFile: false,
              compilerOptions: {
                noEmit: false,
                skipLibCheck: true,
                strict: false,
                noImplicitAny: false,
                jsx: "react-jsx"
              }
            }
          },
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        }
      ]
    },
    externals: {
      'electron': 'commonjs electron'
    },
    plugins: [
      new (require('webpack').DefinePlugin)({
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
        'process.env.npm_package_version': JSON.stringify(require('./package.json').version),
        'process.env.SENTRY_DSN': JSON.stringify('') // Disabled in open-source build
      })
    ]
  }
];
