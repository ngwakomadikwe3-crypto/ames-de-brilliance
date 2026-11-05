/** Keep provider reasoning and control protocols out of customer conversations. */
export function customerAnswer(value: unknown): string {
  if (typeof value !== 'string') return '';
  const answer = value
    .replace(/<(think|analysis|reasoning)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  // Material-change markers are not supported by the current viewer contract.
  // Do not retain a surrounding promise that a material was actually changed.
  if (/\[\[ames-engine:/i.test(answer)) {
    return 'I can help you explore gemstones, but I cannot change this piece’s material in the viewer. Ask the AMES desk about pieces with your preferred gemstone or metal.';
  }
  return answer.trim();
}
