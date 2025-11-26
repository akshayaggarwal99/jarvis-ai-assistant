// Simple update server for Jarvis
// This is what users' apps connect to for updates

const express = require('express');
const app = express();

// Current release info - UPDATE THIS WHEN YOU RELEASE
const currentRelease = {
  version: "0.1.1",
  url: "https://your-domain.com/downloads/Jarvis-0.1.1.dmg",
  releaseDate: "2024-12-28T00:00:00Z",
  releaseNotes: "Bug fixes and performance improvements"
};

// This is what electron-updater calls to check for updates
app.get('/api/update/darwin/:version', (req, res) => {
  const userVersion = req.params.version;
  
  console.log(`Update check from user version: ${userVersion}`);
  
  // If user has older version, send update info
  if (userVersion !== currentRelease.version) {
    res.json({
      url: currentRelease.url,
      name: `Jarvis ${currentRelease.version}`,
      notes: currentRelease.releaseNotes,
      pub_date: currentRelease.releaseDate
    });
  } else {
    // User has latest version
    res.status(204).send(); // No content = no update
  }
});

// Manual download endpoint for website
app.get('/download', (req, res) => {
  res.redirect(currentRelease.url);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Update server running on port ${port}`);
  console.log(`Users will check: /api/update/darwin/[their-version]`);
});
