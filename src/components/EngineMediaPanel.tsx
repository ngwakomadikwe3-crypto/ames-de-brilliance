"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { isMediaReview, loadMediaContent, searchMedia, type MediaRecord } from '../lib/ames-media-content';
import { localMediaInteractionStore, type MediaComment, type MediaInteraction } from '../lib/ames-media-interactions';

function MediaVisual({ record, active }: { record: MediaRecord; active: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active && !failed) video.play().catch(() => { /* Browser may defer autoplay. Poster remains visible. */ });
    else { video.pause(); if (!active) video.currentTime = 0; }
  }, [active, failed]);
  // The engine serves exact pack images; Next image transforms would change that delivery path.
  // eslint-disable-next-line @next/next/no-img-element
  if (record.mediaType === 'image' || failed) return <img src={failed ? record.poster : record.mediaUrl} alt={record.name} className="h-full w-full object-contain" data-media-poster={record.key} />;
  return <video ref={videoRef} src={record.mediaUrl} poster={record.poster} className="h-full w-full object-contain" muted loop playsInline preload={active ? 'auto' : 'metadata'} onError={() => setFailed(true)} data-media-video={record.key} aria-label={record.name} />;
}

function ActionIcon({ name, selected }: { name: 'like' | 'comment' | 'save' | 'buy'; selected?: boolean }) {
  const paths = {
    like: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8Z" />,
    comment: <path d="M20 16a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10Z" />,
    save: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-5-7 5V4a1 1 0 0 1 1-1Z" />,
    buy: <><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill={selected ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function CommentSheet({ record, value, onAdd, onClose }: { record: MediaRecord; value: MediaInteraction; onAdd: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  function submit() { const trimmed = text.trim(); if (trimmed) { onAdd(trimmed); setText(''); } }
  return <div className="fixed inset-0 z-[80] flex items-end justify-center" onClick={onClose} data-media-comment-backdrop>
    <div className="absolute inset-0 bg-black/55" />
    <section role="dialog" aria-modal="true" aria-label={`Comments on ${record.name}`} onClick={event => event.stopPropagation()}
      className="relative flex w-full max-w-2xl flex-col rounded-t-2xl px-5 pt-4 pb-6" style={{ background: '#FCFCFB', maxHeight: '70dvh' }} data-media-comments={record.key}>
      <div className="flex items-center justify-between pb-3"><div><h2 className="text-sm text-[#171717]">Comments</h2><p className="text-[11px] text-[#8A8075]">Saved on this device</p></div><button type="button" onClick={onClose} className="text-xs text-[#6E6C69]" aria-label="Close comments">Close</button></div>
      <div className="min-h-24 flex-1 overflow-y-auto border-t border-[#EAE8E4] py-4">
        {value.comments.length === 0 ? <p className="text-center text-xs text-[#8A8075]">No comments on this device yet.</p> : value.comments.map((comment: MediaComment) => <p key={comment.id} className="mb-3 text-sm text-[#171717]">{comment.text}</p>)}
      </div>
      <div className="flex gap-2 border-t border-[#EAE8E4] pt-3"><input ref={inputRef} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submit(); }} placeholder="Add a comment" maxLength={500} className="min-w-0 flex-1 rounded-full bg-[#F5F4F2] px-4 py-2 text-sm text-[#171717] outline-none" /><button type="button" disabled={!text.trim()} onClick={submit} className="px-3 text-xs text-[#171717] disabled:opacity-40">Post</button></div>
    </section>
  </div>;
}

export default function EngineMediaPanel({ active, onBuy, onAskSame }: { active: boolean; onBuy: (assetId: string) => void; onAskSame: (record: MediaRecord) => void }) {
  const [records, setRecords] = useState<MediaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [commentKey, setCommentKey] = useState<string | null>(null);
  const [interactions, setInteractions] = useState<Record<string, MediaInteraction>>({});
  const feedRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => searchMedia(records, query), [records, query]);

  useEffect(() => {
    let mounted = true;
    loadMediaContent().then(items => { if (mounted) { setRecords(items); setActiveKey(items[0]?.key || null); setInteractions(Object.fromEntries(items.map(item => [item.key, localMediaInteractionStore.read(item.key)]))); setLoading(false); } })
      .catch(() => { if (mounted) { setError(true); setLoading(false); } });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const root = feedRef.current;
    if (!root || !filtered.length) return;
    const observer = new IntersectionObserver(entries => {
      const mostVisible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (mostVisible && mostVisible.intersectionRatio >= 0.5) setActiveKey(mostVisible.target.getAttribute('data-media-item'));
    }, { root, threshold: [0.5, 0.75, 0.99] });
    root.querySelectorAll('[data-media-item]').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [filtered]);

  function changeQuery(value: string) {
    setQuery(value);
    setActiveKey(searchMedia(records, value)[0]?.key || null);
    feedRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }

  function update(key: string, fn: (previous: MediaInteraction) => MediaInteraction) {
    setInteractions(previous => {
      const next = fn(previous[key] || localMediaInteractionStore.read(key));
      localMediaInteractionStore.write(key, next);
      return { ...previous, [key]: next };
    });
  }
  const commentRecord = records.find(record => record.key === commentKey);

  return <div className="relative h-full w-full bg-[#181817] text-[#FCFCFB]" data-media-panel>
    <div className="absolute top-16 left-0 right-0 z-20 mx-auto w-full max-w-2xl px-5"><label className="sr-only" htmlFor="ames-media-search">Search media</label><input id="ames-media-search" type="search" value={query} onChange={event => changeQuery(event.target.value)} placeholder="Search pieces" className="w-full rounded-full border border-white/15 bg-black/25 px-4 py-2 text-sm text-white placeholder:text-white/60 outline-none backdrop-blur-md focus:border-white/50" /></div>
    {loading && <div className="flex h-full items-center justify-center text-xs text-white/60">Loading media…</div>}
    {!loading && (error || !filtered.length) && <div className="flex h-full items-center justify-center px-8 text-center text-sm text-white/60">{error ? 'AMES media is unavailable.' : 'No media matches this search.'}</div>}
    {!loading && !error && <div ref={feedRef} className="h-full overflow-y-auto overscroll-contain" style={{ scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }} data-media-feed>
      {filtered.map((record, index) => {
        const value = interactions[record.key] || { liked: false, saved: false, comments: [] };
        return <section key={record.key} data-media-item={record.key} className="relative flex h-full min-h-full snap-start snap-always items-center justify-center overflow-hidden" style={{ scrollSnapAlign: 'start' }}>
          <div className="absolute inset-0 flex items-center justify-center"><MediaVisual record={record} active={active && activeKey === record.key && !commentKey} /></div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/65 to-transparent" />
          <div className="absolute bottom-7 left-5 right-20 z-10"><p className="text-sm" style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: 22 }}>{record.name}</p><p className="mt-1 text-[11px] text-white/70">{index + 1} / {filtered.length}{isMediaReview(record) ? ' · Preview · approval pending' : ''}</p><button type="button" onClick={() => onAskSame(record)} className="mt-3 border-b border-white/60 pb-0.5 text-xs text-white/90">Ask SAME</button></div>
          <div className="absolute bottom-12 right-4 z-10 flex flex-col items-center gap-5" aria-label="Media actions">
            <button type="button" aria-label="Like" aria-pressed={value.liked} onClick={() => update(record.key, current => ({ ...current, liked: !current.liked }))} className="flex flex-col items-center gap-1 text-white/85"><ActionIcon name="like" selected={value.liked} /><span className="text-[10px]">Like</span></button>
            <button type="button" aria-label="Comment" onClick={() => setCommentKey(record.key)} className="flex flex-col items-center gap-1 text-white/85"><ActionIcon name="comment" /><span className="text-[10px]">Comment</span></button>
            <button type="button" aria-label="Save" aria-pressed={value.saved} onClick={() => update(record.key, current => ({ ...current, saved: !current.saved }))} className="flex flex-col items-center gap-1 text-white/85"><ActionIcon name="save" selected={value.saved} /><span className="text-[10px]">Save</span></button>
            <button type="button" aria-label={`Buy ${record.name}`} onClick={() => onBuy(record.product.assetId)} className="flex flex-col items-center gap-1 text-white/85"><ActionIcon name="buy" /><span className="text-[10px]">Buy</span></button>
          </div>
        </section>;
      })}
    </div>}
    {commentRecord && <CommentSheet record={commentRecord} value={interactions[commentRecord.key] || { liked: false, saved: false, comments: [] }} onClose={() => setCommentKey(null)} onAdd={text => update(commentRecord.key, current => ({ ...current, comments: [...current.comments, { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() }] }))} />}
  </div>;
}
