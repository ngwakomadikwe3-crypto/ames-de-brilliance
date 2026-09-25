export const viewerActions = [
  'rotate', 'stop_rotation', 'zoom', 'reset', 'hero_view', 'macro_view', 'side_view', 'inspect_setting',
] as const;
export type ViewerAction = typeof viewerActions[number];

const phrases: { action: ViewerAction; pattern: RegExp }[] = [
  { action: 'stop_rotation', pattern: /^(?:stop|stop (?:rotating|spinning|the rotation|the spin)|pause (?:rotation|spinning|the spin))\s*[.!?]?$/i },
  { action: 'reset', pattern: /^(?:reset|reset (?:the )?(?:view|ring|stone)|back to (?:the )?(?:start|default) view)\s*[.!?]?$/i },
  { action: 'rotate', pattern: /^(?:spin (?:it|the ring|the stone)|rotate (?:it|the ring|the stone)|start (?:rotating|spinning)|let (?:it|the ring|the stone) spin)\s*[.!?]?$/i },
  { action: 'side_view', pattern: /^(?:show me |let me see |show (?:the |me the )?)(?:the )?(?:side|side view)(?: of (?:the |this )?(?:ring|stone|jewelry))?\s*[.!?]?$/i },
  { action: 'inspect_setting', pattern: /^(?:show me |let me see |show (?:the |me the )?)(?:the )?(?:setting|prongs|setting detail)(?: (?:of|on) (?:the |this )?ring)?\s*[.!?]?$/i },
  { action: 'macro_view', pattern: /^(?:show me |let me see |show (?:the |me the )?)(?:the )?(?:diamond|gemstone|stone)(?: (?:closer|up close|macro|in detail))\s*[.!?]?$/i },
  { action: 'zoom', pattern: /^(?:zoom|zoom in|come closer)\s*[.!?]?$/i },
  { action: 'hero_view', pattern: /^(?:show (?:me )?(?:the )?hero(?: view| image)?|hero view)\s*[.!?]?$/i },
];

export function parseViewerIntent(query: string): ViewerAction | null {
  const text = query.trim().replace(/\s+/g, ' ');
  return phrases.find(item => item.pattern.test(text))?.action ?? null;
}

export function allowedViewerAction(candidate: unknown, supported: readonly string[]): ViewerAction | null {
  return typeof candidate === 'string' && viewerActions.includes(candidate as ViewerAction) && supported.includes(candidate)
    ? candidate as ViewerAction : null;
}

export function actionFromSameResponse(query: string, remoteAction: unknown, supported: readonly string[]): ViewerAction | null {
  return allowedViewerAction(remoteAction, supported) ?? allowedViewerAction(parseViewerIntent(query), supported);
}
