'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Heart, Camera, Play } from 'lucide-react';

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
};

const MAX_POSTS = 12;

export default function InstagramCarousel({ isDark, instagramUrl, instagramHandle }: Props) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [activeIndex, setActiveIndex] = useState(0);
  const [canPrevious, setCanPrevious] = useState(false);
  const [canNext, setCanNext] = useState(false);

  // El feed no compite con el hero ni con la agenda en la carga inicial.
  // Se consulta una sola vez, cuando la galería está cerca de entrar en pantalla.
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
        .finally(() => {
          if (!controller.signal.aborted) setStatus('ready');
        });
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
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, []);

  const updatePosition = useCallback(() => {
    const track = trackRef.current;
    if (!track || !posts.length) return;

    const items = Array.from(track.children) as HTMLElement[];
    const firstOffset = items[0]?.offsetLeft || 0;
    let nearest = 0;
    let nearestDistance = Infinity;
    items.forEach((item, index) => {
      const distance = Math.abs(item.offsetLeft - firstOffset - track.scrollLeft);
      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    });
    setActiveIndex(nearest);
    setCanPrevious(track.scrollLeft > 4);
    setCanNext(track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
  }, [posts.length]);

  useEffect(() => {
    if (!posts.length) return;
    const frame = requestAnimationFrame(updatePosition);
    return () => {
      cancelAnimationFrame(frame);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [posts.length, updatePosition]);

  const onScroll = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(updatePosition);
  };

  const move = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const items = Array.from(track.children) as HTMLElement[];
    const next = Math.max(0, Math.min(items.length - 1, activeIndex + direction));
    if (!items[next] || !items[0]) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollTo({
      left: items[next].offsetLeft - items[0].offsetLeft,
      behavior: reduceMotion ? 'instant' : 'smooth',
    });
  };

  const foreground = isDark ? 'text-zinc-100' : 'text-zinc-900';
  const muted = isDark ? 'text-zinc-400' : 'text-zinc-500';
  const buttonStyle = isDark
    ? 'border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800'
    : 'border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100';

  return (
    <section ref={sectionRef} className="mx-auto max-w-5xl px-4 py-5 sm:py-7" aria-label="Últimos trabajos de Instagram">
      <div className={'overflow-hidden rounded-3xl border ' +
        (isDark ? 'border-zinc-800/90 bg-zinc-900/70' : 'border-zinc-200 bg-white/95 shadow-sm')}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-6 sm:px-7 sm:pt-7">
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2">
              <Camera className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-400">
                {instagramHandle} · Instagram
              </span>
            </div>
            <h2 className={'text-xl font-extrabold tracking-tight sm:text-2xl ' + foreground}>Últimos trabajos</h2>
            <p className={'mt-1 text-xs ' + muted}>Cortes reales, estilo propio. Deslizá para ver más.</p>
          </div>
          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={'inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ' + buttonStyle}
          >
            Ver perfil <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>

        {posts.length > 0 ? (
          <>
            <div
              ref={trackRef}
              onScroll={onScroll}
              className="ig-carousel-track flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-pl-5 px-5 pb-3 sm:gap-4 sm:scroll-pl-7 sm:px-7"
              aria-label="Galería de trabajos, desplazamiento horizontal"
              role="region"
              tabIndex={0}
            >
              {posts.map((post, index) => (
                <a
                  key={post.id}
                  href={post.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={'Abrir publicación ' + (index + 1) + ' de ' + posts.length + ' en Instagram'}
                  className={'group relative block aspect-[4/5] w-[76%] shrink-0 snap-start overflow-hidden rounded-2xl border bg-zinc-950 shadow-lg transition-[transform,opacity,border-color] duration-500 ease-out motion-reduce:transform-none motion-reduce:transition-none sm:w-[44%] lg:w-[30%] ' +
                    (activeIndex === index ? 'scale-100 opacity-100 ' : 'scale-[0.94] opacity-75 ') +
                    (isDark ? 'border-zinc-700/80 hover:border-emerald-400' : 'border-zinc-200 hover:border-emerald-500')}
                >
                  {/* URLs reales de Instagram; sin widgets, scripts de terceros ni precarga masiva. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.imageUrl}
                    alt={post.caption || 'Trabajo de 13 CUT'}
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
              ))}
            </div>
            <div className="flex items-center justify-between gap-4 px-5 pb-5 pt-2 sm:px-7 sm:pb-7">
              <div className="flex min-w-0 items-center gap-3">
                <span className={'text-xs font-bold tabular-nums ' + muted}>
                  {String(activeIndex + 1).padStart(2, '0')} / {String(posts.length).padStart(2, '0')}
                </span>
                <div className={'h-1 w-20 overflow-hidden rounded-full sm:w-32 ' + (isDark ? 'bg-zinc-700' : 'bg-zinc-200')} aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-[width] duration-300 motion-reduce:transition-none"
                    style={{ width: ((activeIndex + 1) / posts.length * 100) + '%' }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => move(-1)}
                  disabled={!canPrevious}
                  aria-label="Publicación anterior"
                  className={'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-35 ' + buttonStyle}
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => move(1)}
                  disabled={!canNext}
                  aria-label="Siguiente publicación"
                  className={'flex h-10 w-10 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-35 ' + buttonStyle}
                >
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
        ) : status === 'ready' ? (
          <div className={'px-5 pb-7 pt-3 text-sm ' + muted}>
            Mirá nuestros trabajos en <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-4">{instagramHandle}</a>.
          </div>
        ) : (
          <div className="flex gap-3 overflow-hidden px-5 pb-6 sm:gap-4 sm:px-7" aria-busy="true" aria-label="Cargando publicaciones de Instagram">
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
