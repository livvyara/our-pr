// src/hooks/useScrambleText.ts
import { useState, useEffect, useCallback } from 'react';

const CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?/ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const useScrambleText = (targetText: string, trigger: boolean) => {
  const [displayText, setDisplayText] = useState(targetText);

  const scramble = useCallback(() => {
    let iteration = 0;
    let interval: NodeJS.Timeout;

    interval = setInterval(() => {
      setDisplayText(
        targetText
          .split('')
          .map((char, index) => {
            if (index < iteration) {
              return targetText[index];
            }
            return CHARS[Math.floor(Math.random() * CHARS.length)];
          })
          .join('')
      );

      if (iteration >= targetText.length) {
        clearInterval(interval);
      }

      iteration += 1 / 3; // 스크램블 속도 조절
    }, 30);

    return () => clearInterval(interval);
  }, [targetText]);

  useEffect(() => {
    if (trigger) {
      const cleanup = scramble();
      return cleanup;
    }
  }, [trigger, scramble]);

  return displayText;
};