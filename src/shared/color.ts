import { z } from 'zod';

const adjustment = z.number().int().min(-100).max(100);
export const ColorSchema = z.object({ brightness: adjustment, contrast: adjustment, saturation: adjustment, warmth: adjustment }).strict();
export type Color = z.infer<typeof ColorSchema>;
export const NEUTRAL_COLOR: Readonly<Color> = Object.freeze({ brightness: 0, contrast: 0, saturation: 0, warmth: 0 });
export const isNeutralColor = (color: Color) => Object.values(color).every(value => value === 0);

// One affine RGB transform shared by SVG (sRGB) and FFmpeg. No CSS approximation.
// Input/output components are normalized 0..1, clamped once after the transform.
export function colorMatrix(color: Color): number[] {
  const c = ColorSchema.parse(color);
  const contrast = 1 + c.contrast / 200;
  const saturation = 1 + c.saturation / 100;
  const bias = c.brightness * 0.003 + (1 - contrast) / 2;
  const weights = [0.2126, 0.7152, 0.0722];
  const warm = [c.warmth * 0.001, 0, -c.warmth * 0.001];
  return [0, 1, 2].flatMap(row => [
    ...weights.map((weight, column) => contrast * ((1 - saturation) * weight + (row === column ? saturation : 0))),
    0, bias + warm[row]
  ]).concat([0, 0, 0, 1, 0]);
}
export function colorFilter(color: Color): string {
  if (isNeutralColor(color)) return 'null';
  const matrix = colorMatrix(color);
  const channels = ['r', 'g', 'b'];
  const expressions = channels.map((channel, row) => {
    const offset = row * 5;
    const expression = channels.map((component, column) => `${matrix[offset + column].toFixed(8)}*${component}(X,Y)`).join('+');
    return `${channel}='clip(${expression}+${(matrix[offset + 4] * 255).toFixed(8)},0,255)'`;
  });
  return `scale=iw:ih:in_color_matrix=bt709:in_range=tv:out_range=full,format=gbrp,setparams=range=full,geq=${expressions.join(':')}:interpolation=nearest,scale=iw:ih:out_color_matrix=bt709:in_range=full:out_range=tv,format=yuv420p,setparams=colorspace=bt709:range=limited`;
}
