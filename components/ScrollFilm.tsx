"use client";

import { useEffect, useRef } from "react";

// Plays the highlight film while it is on screen and drives the progress bar from playback.
export default function ScrollFilm({ gap, label }: { gap: string; label: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video) return;

    let frame = 0;
    const updateProgress = () => {
      const progress = video.duration ? (video.currentTime / video.duration) * 100 : 0;
      section.style.setProperty("--film-progress", `${progress}%`);
    };
    const tick = () => {
      frame = 0;
      updateProgress();
      if (!video.paused && !video.ended) frame = window.requestAnimationFrame(tick);
    };
    const onPlay = () => {
      frame ||= window.requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (video.ended) video.currentTime = 0;
          video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: 0.08 },
    );

    video.addEventListener("play", onPlay);
    video.addEventListener("timeupdate", updateProgress);
    observer.observe(section);
    updateProgress();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      video.removeEventListener("play", onPlay);
      video.removeEventListener("timeupdate", updateProgress);
    };
  }, []);

  return (
    <section className="film" ref={sectionRef} aria-labelledby="film-heading">
      <div className="film-sticky">
        <video ref={videoRef} muted playsInline preload="auto" aria-label="Victor Wembanyama highlight film">
          <source src="/wemby.mp4" type="video/mp4" />
        </video>
        <div className="film-wash" />
        <div className="film-meta">
          <span>{label} / HIGHLIGHTS</span>
          <span>SCROLL TO PLAY</span>
        </div>
        <h2 id="film-heading">
          WATCH
          <br />
          WEMBY
        </h2>
        <div className="film-caption">
          <span>{gap} WS BEHIND</span>
        </div>
        <div className="film-progress" aria-hidden="true">
          <i />
        </div>
      </div>
    </section>
  );
}
