<template>
  <div
    v-if="open"
    class="fixed top-12 right-4 z-50 min-w-[180px] py-2"
    :style="{
      backgroundColor: 'var(--ac-surface, #ffffff)',
      border: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
      borderRadius: 'var(--ac-radius-inner, 8px)',
      boxShadow: 'var(--ac-shadow-float, 0 4px 20px -2px rgba(0,0,0,0.1))',
    }"
  >
    <!-- Theme Section -->
    <div
      class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
      :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
    >
      Theme
    </div>

    <button
      v-for="t in themes"
      :key="t.id"
      class="w-full px-3 py-2 text-left text-sm flex items-center justify-between ac-menu-item"
      :style="{
        color: theme === t.id ? 'var(--ac-accent, #c87941)' : 'var(--ac-text, #1a1a1a)',
      }"
      @click="$emit('theme:set', t.id)"
    >
      <span>{{ t.label }}</span>
      <svg
        v-if="theme === t.id"
        class="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
    </button>

    <!-- Divider -->
    <div
      class="my-2"
      :style="{
        borderTop: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
      }"
    />

    <!-- Input Section -->
    <div
      class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
      :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
    >
      Input
    </div>

    <button
      class="w-full px-3 py-2 text-left text-sm flex items-center justify-between ac-menu-item"
      :style="{ color: 'var(--ac-text, #1a1a1a)' }"
      @click="$emit('fakeCaret:toggle', !fakeCaretEnabled)"
    >
      <span>Comet caret</span>
      <svg
        v-if="fakeCaretEnabled"
        class="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
    </button>

    <!-- Divider -->
    <div
      class="my-2"
      :style="{
        borderTop: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
      }"
    />

    <!-- Storage Section -->
    <div
      class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
      :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
    >
      Storage
    </div>

    <button
      class="w-full px-3 py-2 text-left text-sm ac-menu-item"
      :style="{ color: 'var(--ac-text, #1a1a1a)' }"
      @click="$emit('attachments:open')"
    >
      Clear Attachment Cache
    </button>

    <!-- Divider -->
    <div
      class="my-2"
      :style="{
        borderTop: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
      }"
    />

    <!-- API Section -->
    <div
      class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
      :style="{ color: 'var(--ac-text-subtle, #a8a29e)' }"
    >
      API
    </div>

    <button
      class="w-full px-3 py-2 text-left text-sm ac-menu-item"
      :style="{ color: 'var(--ac-text, #1a1a1a)' }"
      @click="$emit('native-server:settings')"
    >
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <span>Native Server 配置</span>
        <span
          v-if="nativeServerReady"
          class="ml-auto w-2 h-2 rounded-full"
          :style="{ backgroundColor: '#22c55e' }"
        />
      </div>
    </button>

    <button
      class="w-full px-3 py-2 text-left text-sm ac-menu-item"
      :style="{ color: 'var(--ac-text, #1a1a1a)' }"
      @click="$emit('openai:settings')"
    >
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2a10 10 0 1010 10A10 10 0 0012 2z" />
        </svg>
        <span>OpenAI 配置</span>
      </div>
    </button>

    <!-- Divider -->
    <div
      class="my-2"
      :style="{
        borderTop: 'var(--ac-border-width, 1px) solid var(--ac-border, #e5e5e5)',
      }"
    />

    <!-- Reconnect -->
    <button
      class="w-full px-3 py-2 text-left text-sm ac-menu-item"
      :style="{ color: 'var(--ac-text, #1a1a1a)' }"
      @click="$emit('reconnect')"
    >
      Reconnect Server
    </button>
  </div>
</template>

<script lang="ts" setup>
import { type AgentThemeId, THEME_LABELS } from '../../composables';

defineProps<{
  open: boolean;
  theme: AgentThemeId;
  /** Fake caret (comet effect) enabled state */
  fakeCaretEnabled?: boolean;
  /** Whether Native Server is ready (SSE connected) */
  nativeServerReady?: boolean;
}>();

defineEmits<{
  'theme:set': [theme: AgentThemeId];
  reconnect: [];
  'attachments:open': [];
  'fakeCaret:toggle': [enabled: boolean];
  'openai:settings': [];
  'native-server:settings': [];
}>();

const themes: { id: AgentThemeId; label: string }[] = [
  { id: 'warm-editorial', label: THEME_LABELS['warm-editorial'] },
  { id: 'blueprint-architect', label: THEME_LABELS['blueprint-architect'] },
  { id: 'zen-journal', label: THEME_LABELS['zen-journal'] },
  { id: 'neo-pop', label: THEME_LABELS['neo-pop'] },
  { id: 'dark-console', label: THEME_LABELS['dark-console'] },
  { id: 'swiss-grid', label: THEME_LABELS['swiss-grid'] },
];
</script>
