// 自サイトの画像に width/height を付ける（レイアウトのずれ防止）。縦横は scripts/buildImageDims.mjs が
// public/images から読んで imageDims.json に書く。載っていない画像（外部URLなど）には何も付けない。
import dims from './imageDims.json';

export function dimAttrs(src: unknown): { width?: number; height?: number } {
  if (typeof src !== 'string') return {};
  const d = (dims as Record<string, [number, number]>)[src];
  return d ? { width: d[0], height: d[1] } : {};
}
