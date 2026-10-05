/*
 * Copyright: (c) 2024, Alex Kaul
 * GNU General Public License v3.0 or later (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

export function useAudioFile(file: string, volume: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let audio: HTMLAudioElement;
    if (file) {
      audio = new Audio(file);
      audio.volume = volume / 100;
      audio.load();

      audioRef.current = audio;
    } else {
      audioRef.current?.pause();
      audioRef.current = null;
    }

    return () => {
      if (audio) {
        audio.pause();
      }
    };
  }, [file, volume]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.currentTime = 0;
    // A failed playback (no output device, decode error) must not surface as an
    // unhandled rejection; the timer itself has already finished.
    Promise.resolve(audio.play()).catch(() => undefined);
  }, []);

  // Stable identity: the timer widgets list this object in their tick
  // callback's deps, so a new object per render would re-arm their interval.
  return useMemo(() => ({ play }), [play]);
}
