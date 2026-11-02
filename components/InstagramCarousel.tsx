'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, ExternalLink, Heart, Play, Scissors } from 'lucide-react';
import { resolveLoopIndex } from '@/lib/instagram-carousel-loop';

type InstagramPost = {
  id: string;
  imageUrl: string;
  permalink: string;
  caption: string;
  likeCount: number | null;
  isVideo?: boolean;
};

type Props = {
  isDark: boolean;
  instagramUrl: string;
  instagramHandle: string;
  shopName: string;
  bannerUrl: string;
  logoImage: string;
};

const MAX_POSTS = 12;

export default function InstagramCarousel({
  isDark, instagramUrl, instagramHandle, shopName, bannerUrl, logoImage,
}: Props) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(0);
  const teleportingRef = useRef(false);
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [activeSlide, setActiveSlide] = useState(0);

  // Evita que la API de Instagram compita con la carga inicial de la portada.
  useEffect(() => {
    const controller = new AbortController();
    let started = false;
    const load = () => {
      if (started) return;
      started = true;
      setStatus('loading');
      fetch('/api/public/instagram', { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { posts: [] })
        .then((data) => {
          if (controller.signal.aborted) return;
          setPosts(Array.isArray(data.posts) ? data.posts.slice(0, MAX_POSTS) : []);
        })
        .catch(() => {})
        .finally(() => { if (!controller.signal.aborted) setStatus('ready'); });
    };
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === 'undefined') {
      load();
      return () => controller.abort();
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    }, { rootMargin: '500px 0px' });
    observer.observe(section);
    return () => { observer.disconnect(); controller.abort(); };
  }, []);

  // Los duplicados crean una continuidad visual sin una librería de animación.
  // Tres a cada lado permiten conservar el snap incluso con 3 fotos visibles.
  const cloneCount = posts.length > 1 ? Math.min(3, posts.length) : 0;
  const slides = cloneCount
    ? [...posts.slice(-cloneCount), ...posts, ...posts.slice(0, cloneCount)]
    : posts;

  const slideOffset = (track: HTMLDivElement, index: number) => {
    const items = track.children;
    return (items[index] as HTMLElement | undefined)?.offsetLeft
      ? (items[index] as HTMLElement).offsetLeft - (items[0] as HTMLElement).offsetLeft
      : 0;
  };

  const nearestSlide = useCallback((track: HTMLDivElement) => {
    const items = track.children;
    if (!items.length) return 0;
    const base = (items[0] as HTMLElement).offsetLeft;
    let nearest = 0;
    let distance = Infinity;
    for (let i = 0; i < items.length; i += 1) {
      const delta = Math.abs((items[i] as HTMLElement).offsetLeft - base - track.scrollLeft);
      if (delta < distance) { nearest = i; distance = delta; }
    }
    return nearest;
  }, []);

  const updatePosition = useCallback(() => {
    const track = trackRef.current;
    if (!track || !posts.length || teleportingRef.current) return;
    const nearest = nearestSlide(track);
    indexRef.current = nearest;
    setActiveSlide(nearest);
  }, [posts.length, nearestSlide]);

  // Inicio en la primera foto REAL (después de las copias de la izquierda).
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || !posts.length) return;
    track.style.scrollSnapType = 'none';
    track.scrollLeft = slideOffset(track, cloneCount);
    indexRef.current = cloneCount;
    setActiveSlide(cloneCount);
    const frame = requestAnimationFrame(() => {
      if (trackRef.current === track) track.style.scrollSnapType = '';
    });
    return () => cancelAnimationFrame(frame);
  }, [posts.length, cloneCount]);

  const settleLoop = useCallback(() => {
    const track = trackRef.current;
    if (!track || !posts.length || teleportingRef.current) return;

    const physical = nearestSlide(track);
    const real = resolveLoopIndex(physical, posts.length, cloneCount);
    if (real === physical) {
      indexRef.current = physical;
      setActiveSlide(physical);
      return;
    }

    // Solo se salta al terminar el gesto, entre dos fotos idénticas.
    // Desactivar snap durante un frame impide que aparezca un retroceso.
    teleportingRef.current = true;
    track.style.scrollSnapType = 'none';
    track.style.scrollBehavior = 'auto';
    track.scrollLeft = slideOffset(track, real);
    indexRef.current = real;
    setActiveSlide(real);
    if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
    requestAnimationFrame(() => {
      if (trackRef.current === track) {
        track.style.scrollSnapType = '';
        track.style.scrollBehavior = '';
      }
      teleportingRef.current = false;
    });
  }, [posts.length, cloneCount, nearestSlide]);

  const onScroll = () => {
    if (teleportingRef.current) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(updatePosition);
    if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
    // Respaldo para versiones de Safari sin el evento scrollend.
    settleTimerRef.current = setTimeout(settleLoop, 180);
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !posts.length) return;
    track.addEventListener('scrollend', settleLoop);
    const onResize = () => {
      track.style.scrollSnapType = 'none';
      track.scrollLeft = slideOffset(track, indexRef.current);
      requestAnimationFrame(() => { if (trackRef.current === track) track.style.scrollSnapType = ''; });
    };
    window.addEventListener('resize', onResize);
    return () => {
      track.removeEventListener('scrollend', settleLoop);
      window.removeEventListener('resize', onResize);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
    };
  }, [posts.length, settleLoop]);

  const move = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track || posts.length <= 1) return;
    const next = Math.max(0, Math.min(slides.length - 1, indexRef.current + direction));
    track.scrollTo({
      left: slideOffset(track, next),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
    // scrollend vuelve desde la copia extrema a su equivalente real.
  };

  const muted = isDark ? 'text-zinc-400' : 'text-zinc-500';
  const buttonStyle = isDark
    ? 'border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800'
    : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100';

  return (
    <section ref={sectionRef} className="mx-auto max-w-5xl px-4 py-5 sm:py-7" aria-label="Instagram de la barbería">
      <div className={'overflow-hidden rounded-3xl border ' +
        (isDark ? 'border-zinc-800/90 bg-zinc-900/70' : 'border-zinc-200 bg-white/95 shadow-sm')}>
        {/* La portada y el logo ya están en el catálogo público de la barbería. */}
        <div className="relative h-44 overflow-hidden bg-zinc-900 text-white sm:h-48">
          {bannerUrl ? (
            <Image
              src={bannerUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 1024px"
              quality={72}
              loading="lazy"
              className="object-cover object-center"
            />
          ) : <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950" />}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/35 to-zinc-950/10" />
          <div className="absolute inset-x-4 bottom-4 z-10 flex items-end justify-between gap-3 sm:inset-x-7">
            <div className="flex min-w-0 items-end gap-3">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/50 bg-zinc-950 shadow-lg sm:h-16 sm:w-16">
                {logoImage ? (
                  <Image src={logoImage} alt="" fill sizes="64px" quality={75} loading="lazy" className="object-cover" />
                ) : <Scissors className="h-6 w-6 text-white" aria-hidden="true" />}
              </div>
              <div className="min-w-0 pb-1">
                <h2 className="truncate text-lg font-extrabold tracking-tight text-white sm:text-xl">{shopName}</h2>
                <p className="truncate text-xs font-medium text-zinc-200">{instagramHandle}</p>
              </div>
            </div>
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/30 bg-zinc-950/75 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-zinc-950"
            >
              Ver perfil <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>

        {posts.length > 0 ? (
          <>
            <div
              ref={trackRef}
              onScroll={onScroll}
              className="ig-carousel-track flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-pl-5 px-5 pb-3 pt-5 sm:gap-4 sm:scroll-pl-7 sm:px-7 sm:pt-6"
              aria-label="Publicaciones de Instagram: carrusel continuo"
              role="region"
              tabIndex={0}
            >
              {slides.map((post, index) => {
                const isClone = index < cloneCount || index >= cloneCount + posts.length;
                const realIndex = (index - cloneCount + posts.length) % posts.length;
                return (
                  <a
                    key={post.id + '-' + index}
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-hidden={isClone}
                    tabIndex={isClone ? -1 : undefined}
                    aria-label={'Abrir publicación ' + (realIndex + 1) + ' de ' + posts.length + ' en Instagram'}
                    className={'group relative block aspect-[4/5] w-[76%] shrink-0 snap-start overflow-hidden rounded-2xl border bg-zinc-950 shadow-lg transition-[transform,opacity,border-color] duration-500 ease-out motion-reduce:transform-none motion-reduce:transition-none sm:w-[44%] lg:w-[30%] ' +
                      (activeSlide === index ? 'scale-100 opacity-100 ' : 'scale-[0.94] opacity-75 ') +
                      (isDark ? 'border-zinc-700/80 hover:border-emerald-400' : 'border-zinc-200 hover:border-emerald-500')}
                  >
                    {/* URLs reales de Instagram; sin widgets ni scripts de terceros. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.imageUrl}
                      alt={post.caption || 'Publicación de ' + shopName}
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                      referrerPolicy="no-referrer"
                      width={480}
                      height={600}
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 via-black/10 to-transparent px-3 pb-3 pt-12">
                      {typeof post.likeCount === 'number' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1.5 text-[11px] font-semibold text-white">
                          <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                          {post.likeCount.toLocaleString('es-UY')}
                        </span>
                      ) : <span />}
                      <span className="rounded-full bg-black/50 p-2 text-white">
                        {post.isVideo ? <Play className="h-4 w-4 fill-current" aria-hidden="true" /> :
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-2 sm:px-7 sm:pb-7">
              <button
                type="button"
                onClick={() => move(-1)}
                disabled={posts.length <= 1}
                aria-label="Publicación anterior"
                className={'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-35 ' + buttonStyle}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => move(1)}
                disabled={posts.length <= 1}
                aria-label="Siguiente publicación"
                className={'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-35 ' + buttonStyle}
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </>
        ) : status === 'ready' ? (
          <div className={'px-5 py-7 text-sm ' + muted}>
            Mirá nuestras publicaciones en <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">{instagramHandle}</a>.
          </div>
        ) : (
          <div className="flex gap-3 overflow-hidden px-5 py-6 sm:gap-4 sm:px-7" aria-busy="true" aria-label="Cargando publicaciones de Instagram">
            {[0, 1, 2].map((index) => (
              <div key={index} className={'aspect-[4/5] w-[76%] shrink-0 rounded-2xl sm:w-[44%] lg:w-[30%] ' +
                (isDark ? 'bg-zinc-800' : 'bg-zinc-100')} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
