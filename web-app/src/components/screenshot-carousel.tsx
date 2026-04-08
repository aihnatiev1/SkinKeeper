'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Slide {
  src: string;
  alt: string;
  caption?: string;
}

interface ScreenshotCarouselProps {
  slides: Slide[];
  autoPlay?: boolean;
  interval?: number;
}

export function ScreenshotCarousel({ slides, autoPlay = true, interval = 5000 }: ScreenshotCarouselProps) {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback((idx: number) => {
    setCurrent(((idx % slides.length) + slides.length) % slides.length);
  }, [slides.length]);

  const next = useCallback(() => go(current + 1), [current, go]);
  const prev = useCallback(() => go(current - 1), [current, go]);

  // Auto-play
  useEffect(() => {
    if (!autoPlay || slides.length <= 1) return;
    timerRef.current = setInterval(next, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoPlay, interval, next, slides.length]);

  // Pause on hover
  const pause = () => { if (timerRef.current) clearInterval(timerRef.current); };
  const resume = () => {
    if (!autoPlay || slides.length <= 1) return;
    timerRef.current = setInterval(next, interval);
  };

  if (slides.length === 0) return null;

  return (
    <div
      className="relative group"
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      {/* Image container */}
      <div className="relative overflow-hidden rounded-xl border border-border/30">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {slides.map((slide, i) => (
            <div key={i} className="w-full shrink-0">
              <img
                src={slide.src}
                alt={slide.alt}
                className="w-full h-auto"
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            </div>
          ))}
        </div>

        {/* Caption overlay */}
        {slides[current]?.caption && (
          <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/80 to-transparent">
            <p className="text-sm text-white/90 font-medium">{slides[current].caption}</p>
          </div>
        )}
      </div>

      {/* Navigation arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Dots */}
      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === current
                  ? 'w-6 bg-primary'
                  : 'w-1.5 bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
