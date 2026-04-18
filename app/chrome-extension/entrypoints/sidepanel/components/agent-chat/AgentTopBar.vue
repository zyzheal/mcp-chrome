<template>
  <div class="top-bar-root flex items-center">
    <!-- Left: Brand / Context -->
    <div ref="leftGroup" class="top-bar-left flex items-center gap-2 shrink-0 -ml-1">
      <!-- Back Button (when in chat view) -->
      <button
        v-if="showBackButton"
        class="flex items-center justify-center w-8 h-8 flex-shrink-0 ac-btn"
        :style="{
          color: 'var(--ac-text-muted)',
          borderRadius: 'var(--ac-radius-button)',
        }"
        title="Back to sessions"
        @click="$emit('back')"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>

      <!-- Brand -->
      <h1
        class="text-lg font-medium tracking-tight shrink-0"
        :style="{
          fontFamily: 'var(--ac-font-heading)',
          color: 'var(--ac-text)',
        }"
      >
        {{ brandLabel || 'Agent' }}
      </h1>

      <!-- Divider -->
      <div class="h-4 w-[1px] shrink-0" :style="{ backgroundColor: 'var(--ac-border-strong)' }" />

      <!-- Project Breadcrumb -->
      <button
        class="flex items-center gap-1.5 text-xs px-2 py-1 truncate group ac-btn"
        :style="{
          fontFamily: 'var(--ac-font-mono)',
          color: 'var(--ac-text-muted)',
          borderRadius: 'var(--ac-radius-button)',
        }"
        @click="$emit('toggle:projectMenu')"
      >
        <span class="truncate">{{ projectLabel }}</span>
        <svg
          class="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <!-- Session Breadcrumb -->
      <div class="h-3 w-[1px] shrink-0" :style="{ backgroundColor: 'var(--ac-border)' }" />
      <button
        class="flex items-center gap-1.5 text-xs px-2 py-1 truncate group ac-btn"
        :style="{
          fontFamily: 'var(--ac-font-mono)',
          color: 'var(--ac-text-subtle)',
          borderRadius: 'var(--ac-radius-button)',
        }"
        @click="$emit('toggle:sessionMenu')"
      >
        <span class="truncate">{{ sessionLabel }}</span>
        <svg
          class="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
    </div>

    <!-- Center: Clawd Animation -->
    <div class="top-bar-clawd relative shrink-0">
      <canvas ref="clawdCanvas" class="clawd-canvas" />
    </div>

    <!-- Right: Connection / Status / Settings -->
    <div ref="rightGroup" class="top-bar-right flex items-center gap-3 shrink-0">
      <!-- Connection Indicator -->
      <div class="flex items-center gap-1.5" :title="connectionText">
        <span
          class="w-2 h-2 rounded-full"
          :style="{
            backgroundColor: connectionColor,
            boxShadow: connectionState === 'ready' ? `0 0 8px ${connectionColor}` : 'none',
          }"
        />
      </div>

      <!-- Open Project Button -->
      <button
        class="p-1 ac-btn ac-hover-text"
        :style="{ color: 'var(--ac-text-subtle)', borderRadius: 'var(--ac-radius-button)' }"
        title="Open project in VS Code or Terminal"
        @click="$emit('toggle:openProjectMenu')"
      >
        <svg
          class="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
      </button>

      <!-- Theme & Settings Icon (Color Palette) -->
      <button
        class="p-1 ac-btn ac-hover-text"
        :style="{ color: 'var(--ac-text-subtle)', borderRadius: 'var(--ac-radius-button)' }"
        @click="$emit('toggle:settingsMenu')"
      >
        <svg
          class="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
          <path
            d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';

const clawdCanvas = ref<HTMLCanvasElement | null>(null);
const leftGroup = ref<HTMLElement | null>(null);
const rightGroup = ref<HTMLElement | null>(null);
let animFrame: number | null = null;

// Clawd body pixels (same as SKILL.md)
const BODY = [
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0],
  [0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0],
];

const CLAWD_W = 14;
const CLAWD_H = 8;
const PX = 3;
const BODY_CLR = '#CD6E58';
const EYE_CLR = '#000';

function drawClawd(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  eyeDl = 0,
  eyeDr = 0,
  eyeDy = 0,
) {
  for (let r = 0; r < CLAWD_H; r++) {
    for (let c = 0; c < CLAWD_W; c++) {
      if (BODY[r][c]) {
        const isEye = (r === 6 || r === 7) && (c === 4 || c === 9);
        ctx.fillStyle = isEye ? EYE_CLR : BODY_CLR;
        ctx.fillRect(ox + c * PX, oy + r * PX, PX, PX);
      }
    }
  }
  // Eyes with offset
  const el = { x: 4, y: 1 };
  const er = { x: 9, y: 1 };
  ctx.fillStyle = EYE_CLR;
  if (eyeDl !== 0 || eyeDr !== 0 || eyeDy !== 0) {
    ctx.fillRect(ox + (el.x + eyeDl) * PX, oy + (el.y + eyeDy) * PX, PX, PX);
    ctx.fillRect(ox + (er.x + eyeDr) * PX, oy + (er.y + eyeDy) * PX, PX, PX);
  }
}

/** Draw Clawd with raised right claw (wave) */
function drawClawdWave(ctx: CanvasRenderingContext2D, ox: number, oy: number, waveUp: number) {
  drawClawd(ctx, ox, oy);
  const clawPixels =
    waveUp > 0.5
      ? [
          [13, -2],
          [14, -3],
          [14, -2],
        ]
      : [
          [13, -1],
          [14, -2],
        ];
  ctx.fillStyle = BODY_CLR;
  for (const [cx, cy] of clawPixels) {
    ctx.fillRect(ox + cx * PX, oy + cy * PX, PX, PX);
  }
}

/** Draw door edge indicator */
function drawDoorEdge(ctx: CanvasRenderingContext2D, x: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(x, 0, 1, h);
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function startAnimation() {
  const canvas = clawdCanvas.value;
  if (!canvas) return;

  const clawdStage = canvas.parentElement;
  if (!clawdStage) return;

  const rect = clawdStage.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio));
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const clawdPxH = CLAWD_H * PX; // 24
  const clawdPxW = CLAWD_W * PX; // 42
  const baseY = Math.round((H - clawdPxH) / 2); // center vertically

  const TOTAL_DUR = 10;
  const PHASE_DUR = TOTAL_DUR / 3;
  let startTime: number | null = null;

  function render(ts: number) {
    if (!startTime) startTime = ts;
    const elapsed = ((ts - startTime) / 1000) % TOTAL_DUR;
    const phaseIdx = Math.floor(elapsed / PHASE_DUR);
    const pt = (elapsed - phaseIdx * PHASE_DUR) / PHASE_DUR;

    ctx.clearRect(0, 0, W, H);

    if (phaseIdx === 0) {
      // ═══ PHASE 0: Peek-a-boo ═══
      let showAmount: number;
      if (pt < 0.3) {
        showAmount = easeOut(pt / 0.3);
      } else if (pt < 0.7) {
        showAmount = 1 + Math.sin(((pt - 0.3) / 0.4) * Math.PI * 2) * 0.1;
      } else {
        showAmount = 1 - easeInOut((pt - 0.7) / 0.3);
      }
      const offsetY = (1 - showAmount) * clawdPxH;
      const ox = Math.round((W - clawdPxW) / 2);
      const oy = baseY + offsetY;
      const eyeDy = showAmount < 0.5 ? -1 : 0;
      drawClawd(ctx, ox, oy, 0, 0, eyeDy);
    } else if (phaseIdx === 1) {
      // ═══ PHASE 1: Wave (举手挥舞) ═══
      const ox = Math.round((W - clawdPxW) / 2);
      const oy = baseY;
      const bounce = Math.round(Math.sin(pt * Math.PI * 2) * 1);

      if (pt < 0.15) {
        drawClawdWave(ctx, ox, oy + bounce, easeOut(pt / 0.15));
      } else if (pt < 0.85) {
        const waveCycle = (pt - 0.15) / 0.7;
        const waveUp = (Math.sin(waveCycle * Math.PI * 2) + 1) / 2;
        drawClawdWave(ctx, ox, oy + bounce, 0.5 + waveUp * 0.5);
      } else {
        drawClawdWave(ctx, ox, oy, 1 - easeInOut((pt - 0.85) / 0.15));
      }
    } else {
      // ═══ PHASE 2: Door edge peek (藏一半身子在门口) ═══
      const edgeX = W - clawdPxW / 2;
      let hideProgress: number;
      if (pt < 0.25) {
        hideProgress = easeInOut(pt / 0.25);
      } else if (pt < 0.7) {
        const peekT = (pt - 0.25) / 0.45;
        hideProgress = 1 - Math.sin(peekT * Math.PI) * 0.6;
      } else {
        hideProgress = 1 - easeOut((pt - 0.7) / 0.3);
      }

      const centerX = (W - clawdPxW) / 2;
      const targetX = edgeX - clawdPxW;
      const ox = Math.round(centerX + (targetX - centerX) * hideProgress);
      const oy = baseY;

      drawDoorEdge(ctx, edgeX, H);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, edgeX, H);
      ctx.clip();
      drawClawd(ctx, ox, oy, -1, 1, 0);
      ctx.restore();
    }

    animFrame = requestAnimationFrame(render);
  }

  animFrame = requestAnimationFrame(render);
}

onMounted(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      startAnimation();
    });
  });
});

onUnmounted(() => {
  if (animFrame) cancelAnimationFrame(animFrame);
});

export type ConnectionState = 'ready' | 'connecting' | 'disconnected';

const props = defineProps<{
  projectLabel: string;
  sessionLabel: string;
  connectionState: ConnectionState;
  showBackButton?: boolean;
  brandLabel?: string;
}>();

defineEmits<{
  'toggle:projectMenu': [];
  'toggle:sessionMenu': [];
  'toggle:settingsMenu': [];
  'toggle:openProjectMenu': [];
  back: [];
}>();

const connectionColor = computed(() => {
  switch (props.connectionState) {
    case 'ready':
      return 'var(--ac-success)';
    case 'connecting':
      return 'var(--ac-warning)';
    default:
      return 'var(--ac-text-subtle)';
  }
});

const connectionText = computed(() => {
  switch (props.connectionState) {
    case 'ready':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    default:
      return 'Disconnected';
  }
});
</script>

<style scoped>
.top-bar-root {
  width: 100%;
  height: 40px;
}

.top-bar-left {
  max-width: 55%;
  min-width: 0;
}

.top-bar-clawd {
  width: 120px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.clawd-canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.top-bar-right {
  min-width: 0;
}
</style>
