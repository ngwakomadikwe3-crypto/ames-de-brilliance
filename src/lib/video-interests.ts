import type {MediaRecord} from './ames-media-content';
export const VIDEO_INTERESTS = [{id:'hip-hop',label:'Hip Hop',tag:'hiphop'},{id:'luxury',label:'Luxury',tag:'luxury'},{id:'women',label:'Women',tag:'women'},{id:'gen-z',label:'Gen Z',tag:'genz'},{id:'men',label:'Men',tag:'men'}] as const;
export type VideoInterest = typeof VIDEO_INTERESTS[number]['id'];
export type VideoFeedFilter = 'for-you' | VideoInterest;
export function videoInterests(terms: string[]): VideoInterest[] {
  const tags=terms.map(term=>term.trim().toLowerCase());
  return VIDEO_INTERESTS.filter(c=>tags.some(term=>term===c.id||term===c.label.toLowerCase()||new RegExp(`(?:^|\\s)#${c.tag}(?=$|\\s|[.,!?])`,'i').test(term))).map(c=>c.id);
}
export function captionWithInterests(caption: string, selected: VideoInterest[]): string {
  const clean=caption.replace(/(^|\s)#(?:hiphop|luxury|women|genz|men)(?=$|\s|[.,!?])/gi,' ').replace(/\s+/g,' ').trim();
  return [clean,...VIDEO_INTERESTS.filter(c=>selected.includes(c.id)).map(c=>'#'+c.tag)].filter(Boolean).join(' ');
}
export function filterVideoFeed<T extends MediaRecord>(records:T[], filter:VideoFeedFilter):T[] {
  const videos=records.filter(record=>record.mediaType==='video');
  return filter==='for-you'?videos:videos.filter(record=>videoInterests(record.searchTerms).includes(filter));
}
