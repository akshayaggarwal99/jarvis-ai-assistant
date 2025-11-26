// Simple resize functionality
document.addEventListener('DOMContentLoaded', () => {
  // If using Electron
  try {
    const { ipcRenderer } = require('electron');
    
    // Add event listeners for window controls
    document.getElementById('minimize-button')?.addEventListener('click', () => {
      ipcRenderer.send('minimize-window');
    });
    
    document.getElementById('maximize-button')?.addEventListener('click', () => {
      ipcRenderer.send('maximize-window');
    });
    
    document.getElementById('close-button')?.addEventListener('click', () => {
      ipcRenderer.send('close-window');
    });

    // Add event listener for Explore Pro button
    document.getElementById('explore-pro-btn')?.addEventListener('click', async () => {
      try {
        console.log('🔄 Starting Stripe checkout process...');
        const result = await ipcRenderer.invoke('get-stripe-checkout-url');
        
        if (result.error) {
          console.error('❌ Failed to get checkout URL:', result.error);
          alert('Failed to start checkout process. Please try again.');
          return;
        }
        
        if (result.url) {
          console.log('✅ Opening Stripe checkout URL:', result.url);
          await ipcRenderer.invoke('open-external', result.url);
        } else {
          console.error('❌ No checkout URL returned');
          alert('Failed to get checkout URL. Please try again.');
        }
      } catch (error) {
        console.error('❌ Error during checkout process:', error);
        alert('An error occurred. Please try again.');
      }
    });
    
  } catch (error) {
    console.log('Not running in Electron environment');
  }
  
  // Set up manual resize if needed (for web environments)
  // This is a minimal implementation - can be expanded if needed
  const resizable = document.querySelector('.resizable');
  if (resizable) {
    // Add resize constraints
    resizable.addEventListener('resize', () => {
      if (resizable.offsetWidth < 400) resizable.style.width = '400px';
      if (resizable.offsetHeight < 300) resizable.style.height = '300px';
      if (resizable.offsetWidth > 800) resizable.style.width = '800px';
      if (resizable.offsetHeight > 600) resizable.style.height = '600px';
    });
  }
});
