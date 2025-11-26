import React, { useEffect, useState } from 'react';
import { theme } from '../styles/theme';
// @ts-ignore
import confetti from 'canvas-confetti';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  confettiDuration?: number;
}

export function SuccessModal({ 
  isOpen, 
  onClose, 
  title = "Welcome to Jarvis Pro!", 
  message = "Thank you for upgrading! Enjoy unlimited transcriptions and premium features.",
  confettiDuration = 3000 
}: SuccessModalProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      
      // Play celebration sound
      if ((window as any).electronAPI?.playSound) {
        (window as any).electronAPI.playSound('celebration');
      }
      
      // Launch confetti
      const duration = confettiDuration;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      function randomInRange(min: number, max: number) {
        return Math.random() * (max - min) + min;
      }

      const interval = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        
        // Left side confetti
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        });
        
        // Right side confetti
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        });
      }, 250);

      // Auto close after 5 seconds
      const timeout = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300); // Wait for fade out animation
      }, 5000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [isOpen, confettiDuration, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 ${theme.background.modal} flex items-center justify-center z-50 transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={() => {
        setIsVisible(false);
        setTimeout(onClose, 300);
      }}
    >
      <div 
        className={`${theme.glass.primary} ${theme.radius.xl} ${theme.shadow["2xl"]} border border-white/20 p-12 max-w-md mx-4 text-center transform transition-all duration-300 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon container with gradient background */}
        <div className={`inline-flex items-center justify-center w-16 h-16 ${theme.glass.secondary} border border-white/20 ${theme.radius["2xl"]} mb-6`}>
          <span className="text-3xl">🎉</span>
        </div>
        
        <h2 className={`text-2xl font-semibold ${theme.text.primary} mb-3`}>
          {title}
        </h2>
        
        <p className={`${theme.text.secondary} mb-8 max-w-sm mx-auto leading-relaxed`}>
          {message}
        </p>
        
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(onClose, 300);
          }}
          className={`${theme.glass.secondary} hover:${theme.glass.hover} ${theme.text.primary} px-8 py-3 ${theme.radius.lg} font-medium transition-all duration-200 transform hover:scale-105 active:scale-95 ${theme.shadow.lg} border border-white/20`}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
