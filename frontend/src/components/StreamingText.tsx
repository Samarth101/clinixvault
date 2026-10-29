import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface StreamingTextProps {
  content: string;
  isStreaming: boolean;
  speedMs?: number;
  onComplete?: () => void;
  className?: string;
}

export const StreamingText: React.FC<StreamingTextProps> = ({
  content,
  isStreaming,
  speedMs = 28,
  onComplete,
  className = '',
}) => {
  const [streamedText, setStreamedText] = useState('');
  const [isFinished, setIsFinished] = useState(!isStreaming);

  useEffect(() => {
    if (!isStreaming) return;

    const words = content.split(' ');
    let currentIndex = 0;

    const interval = setInterval(() => {
      if (currentIndex < words.length) {
        currentIndex++;
        setStreamedText(words.slice(0, currentIndex).join(' '));
      } else {
        clearInterval(interval);
        setIsFinished(true);
        if (onComplete) onComplete();
      }
    }, speedMs);

    return () => clearInterval(interval);
  }, [content, isStreaming, speedMs, onComplete]);

  const displayedText = isStreaming ? streamedText : content;
  const showCursor = isStreaming && !isFinished;

  return (
    <div className={`relative ${className}`}>
      <span>{displayedText}</span>
      {showCursor && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ repeat: Infinity, duration: 0.6 }}
          className="inline-block w-1.5 h-3.5 ml-1 bg-clinical-blue rounded-sm align-middle shadow-[0_0_8px_rgba(37,99,235,0.8)]"
        />
      )}
    </div>
  );
};
