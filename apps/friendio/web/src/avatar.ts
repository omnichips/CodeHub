import { AVATAR_COLORS, AVATAR_SIZE } from '../../shared/protocol';

export const BLANK_AVATAR = '0'.repeat(AVATAR_SIZE * AVATAR_SIZE);

// avatars are drawn as a top view of the round player, so only cells inside the circle count
export const inAvatarCircle = (index: number) => {
  const x = (index % AVATAR_SIZE) + 0.5 - AVATAR_SIZE / 2;
  const y = Math.floor(index / AVATAR_SIZE) + 0.5 - AVATAR_SIZE / 2;
  return x * x + y * y <= (AVATAR_SIZE / 2) ** 2;
};

export function paintAvatar(canvas: HTMLCanvasElement, avatar: string, background?: string) {
  canvas.width = canvas.height = AVATAR_SIZE;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  [...avatar].forEach((cell, index) => {
    const color = cell !== '0' ? AVATAR_COLORS[Number(cell) - 1] : background && inAvatarCircle(index) ? background : '';
    if (!color) return;
    context.fillStyle = color;
    context.fillRect(index % AVATAR_SIZE, Math.floor(index / AVATAR_SIZE), 1, 1);
  });
  return canvas;
}
