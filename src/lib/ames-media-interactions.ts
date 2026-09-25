export type MediaComment = { id: string; text: string; createdAt: string };
export type MediaInteraction = { liked: boolean; saved: boolean; comments: MediaComment[] };
export interface MediaInteractionStore {
  read(key: string): MediaInteraction;
  write(key: string, value: MediaInteraction): void;
}

const empty = (): MediaInteraction => ({ liked: false, saved: false, comments: [] });
const storageKey = (key: string) => `ames-media-v1:${key}`;

// Device-local v1 boundary. A future account-backed implementation can replace this store.
export const localMediaInteractionStore: MediaInteractionStore = {
  read(key) {
    try {
      const raw = window.localStorage.getItem(storageKey(key));
      if (!raw) return empty();
      const value = JSON.parse(raw);
      return { liked: value.liked === true, saved: value.saved === true,
        comments: Array.isArray(value.comments) ? value.comments.filter((entry: unknown): entry is MediaComment =>
          !!entry && typeof entry === 'object' && typeof (entry as MediaComment).id === 'string' && typeof (entry as MediaComment).text === 'string' && typeof (entry as MediaComment).createdAt === 'string') : [] };
    } catch { return empty(); }
  },
  write(key, value) {
    try { window.localStorage.setItem(storageKey(key), JSON.stringify(value)); } catch { /* Storage can be unavailable. Current-session state remains. */ }
  },
};
