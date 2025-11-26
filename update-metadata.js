const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

async function updateLatestMetadata() {
  try {
    console.log('📤 Updating latest.json metadata...');
    
    // Initialize Firebase Storage
    const storage = new Storage({
      projectId: 'jarvis-aa14d'
    });
    
    const bucket = storage.bucket('jarvis-aa14d.firebasestorage.app');
    
    // Read our temp file
    const metadata = {
      "version": "0.1.1",
      "url": "https://storage.googleapis.com/jarvis-aa14d.firebasestorage.app/releases/Jarvis-0.1.1.dmg",
      "releaseDate": "2025-07-23T04:25:41.723Z",
      "sha256": "9d23f0cdaf5e5232ae038f6c053f0bf9eaaa79c5afb4f848bf305ab20349416d",
      "size": 172743446,
      "releaseNotes": "Jarvis v0.1.1 - Enhanced AI Assistant with improved performance and new features.",
      "minSystemVersion": "10.15.0"
    };
    
    // Upload metadata
    const metadataFile = bucket.file('releases/latest.json');
    await metadataFile.save(JSON.stringify(metadata, null, 2), {
      metadata: {
        contentType: 'application/json'
      },
      public: true
    });
    
    console.log('✅ latest.json updated successfully');
    
  } catch (error) {
    console.error('❌ Failed to update metadata:', error);
  }
}

updateLatestMetadata();
