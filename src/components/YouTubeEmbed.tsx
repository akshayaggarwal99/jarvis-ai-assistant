import React, { useState, useRef, useEffect } from 'react';

interface YouTubeEmbedProps {
  videoId: string;
  title?: string;
  autoplay?: boolean;
  className?: string;
  showThumbnail?: boolean;
  onVideoStart?: () => void;
  onVideoEnd?: () => void;
}

const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({
  videoId,
  title = 'Video',
  autoplay = false,
  className = '',
  showThumbnail = true,
  onVideoStart,
  onVideoEnd,
}) => {
  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [hasError, setHasError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use nocookie domain to avoid some embedding restrictions
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0&modestbranding=1`;

  const handlePlayVideo = () => {
    console.log('🎥 [YouTubeEmbed] Video play triggered');
    setIsPlaying(true);
    onVideoStart?.();
  };

  const handleOpenExternal = () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.openExternal) {
      electronAPI.openExternal(`https://www.youtube.com/watch?v=${videoId}`);
    } else {
      window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
    }
    onVideoStart?.();
  };

  const handleIframeError = () => {
    console.log('🎥 [YouTubeEmbed] Iframe error - showing fallback');
    setHasError(true);
  };

  // Debug container dimensions
  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      console.log('🎥 [YouTubeEmbed] Container dimensions:', {
        width: rect.width,
        height: rect.height,
        isPlaying
      });
    }
  }, [isPlaying]);

  // Common container styles
  const containerStyle = "relative w-full h-full overflow-hidden rounded-xl";
  const iframeStyle = "absolute inset-0 w-full h-full border-0 rounded-xl";

  // Show error fallback with button to open in browser
  if (hasError) {
    return (
      <div ref={containerRef} className={`${containerStyle} ${className} bg-black/40 flex flex-col items-center justify-center`} style={{ minHeight: '400px' }}>
        <img
          src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
          alt={`${title} Thumbnail`}
          className="absolute inset-0 w-full h-full object-cover rounded-xl opacity-30"
        />
        <div className="relative z-10 text-center p-6">
          <p className="text-white/70 mb-4">Video cannot be embedded. Click to watch on YouTube.</p>
          <button
            onClick={handleOpenExternal}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg flex items-center gap-2 mx-auto transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Watch on YouTube
          </button>
        </div>
      </div>
    );
  }

  if (!showThumbnail || isPlaying) {
    return (
      <div ref={containerRef} className={`${containerStyle} ${className}`} style={{ minHeight: '400px' }}>
        <iframe
          ref={iframeRef}
          src={autoplay ? `${embedUrl}&autoplay=1` : embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className={iframeStyle}
          style={{ aspectRatio: '16/9' }}
          onError={handleIframeError}
        />
        {/* Fallback button if embed fails */}
        <button
          onClick={handleOpenExternal}
          className="absolute bottom-4 right-4 px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white text-sm rounded-md transition-colors"
        >
          Open in Browser
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`${containerStyle} group cursor-pointer ${className}`} onClick={handlePlayVideo} style={{ minHeight: '400px' }}>
      <img
        src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
        alt={`${title} Thumbnail`}
        className="w-full h-full object-cover rounded-xl"
        onError={(e) => {
          // Fallback to hqdefault if maxresdefault doesn't exist
          (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow group-hover:scale-110 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-6 h-6 text-slate-700 ml-1">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
      </div>
      {/* Option to open in browser */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleOpenExternal();
        }}
        className="absolute bottom-4 right-4 px-3 py-1.5 bg-black/60 hover:bg-black/80 text-white text-sm rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
      >
        Open in Browser
      </button>
    </div>
  );
};

export default YouTubeEmbed;
