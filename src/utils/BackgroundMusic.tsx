import React, {useEffect, useRef, useState} from 'react';

export interface BackgroundMusicProps {
  readonly url: string;
  readonly isPlaying: boolean;
  readonly isMuted?: boolean;
  readonly volume?: number;
}

export function BackgroundMusic({
  url,
  isPlaying,
  isMuted = false,
  volume = 0.25,
}: BackgroundMusicProps): React.ReactElement | null {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.loop = true;
    } else if (audioRef.current.src !== url) {
      audioRef.current.src = url;
    }
  }, [url]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.muted = isMuted;
    audio.volume = Math.max(0, Math.min(1, volume));

    if (isPlaying) {
      audio.play().catch(() => {
        // Autoplay policy fallback
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, isMuted, volume]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return null;
}

export default BackgroundMusic;
