<template>
  <div
    class="flex items-center gap-2 mt-6 pt-4 border-t"
    style="border-color: var(--ac-border, #e0e0e0)"
  >
    <div class="relative">
      <button
        ref="buttonRef"
        type="button"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer"
        :style="{
          color: 'var(--ac-text, #333)',
          backgroundColor: isOpen ? 'var(--ac-surface-muted, #f5f5f5)' : 'transparent',
        }"
        @click="toggleMenu"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4v12m0 0l-4-4m4 4l4-4M4 18h16"
          />
        </svg>
        <span>导出</span>
        <svg
          class="w-3 h-3 transition-transform"
          :class="{ 'rotate-180': isOpen }"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>

    <!-- Dropdown menu (teleported to body to avoid overflow clipping) -->
    <Teleport :to="teleportTarget" :disabled="!teleportTarget">
      <Transition name="export-menu">
        <div
          v-if="isOpen"
          class="fixed min-w-[160px] rounded-lg shadow-lg overflow-hidden z-50 export-menu"
          :style="{
            left: `${menuLeft}px`,
            top: menuTop,
            backgroundColor: 'var(--ac-surface, #fff)',
            border: '1px solid var(--ac-border, #e0e0e0)',
          }"
          @click.stop
        >
          <button
            v-for="option in formatOptions"
            :key="option.format"
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer hover:bg-gray-50"
            :style="{
              color: 'var(--ac-text, #333)',
            }"
            @click="handleExport(option.format)"
          >
            <span class="text-base">{{ option.icon }}</span>
            <div class="flex flex-col items-start">
              <span class="font-medium">{{ option.label }}</span>
              <span class="text-xs opacity-60">{{ option.extension }}</span>
            </div>
          </button>
        </div>
      </Transition>
    </Teleport>

    <!-- Loading indicator -->
    <span v-if="isExporting" class="text-xs" style="color: var(--ac-text-muted, #888)">
      导出中...
    </span>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import type { AgentThread } from '../../composables/useAgentThreads';
import type { ExportFormat } from '../../composables/useConversationExport';
import { useConversationExport } from '../../composables/useConversationExport';

const props = defineProps<{
  thread: AgentThread;
}>();

const { exportThread } = useConversationExport();
const isOpen = ref(false);
const isExporting = ref(false);
const buttonRef = ref<HTMLElement | null>(null);
const teleportTarget = ref<string | null>(null);

// Menu position (fixed, calculated relative to viewport)
const menuLeft = ref(0);
const menuTop = ref('0px');

const formatOptions: Array<{
  format: ExportFormat;
  label: string;
  icon: string;
  extension: string;
}> = [
  { format: 'markdown', label: 'Markdown', icon: 'MD', extension: '.md' },
  { format: 'html', label: 'HTML', icon: 'HTML', extension: '.html' },
  { format: 'docx', label: 'Word', icon: 'DOCX', extension: '.docx' },
  { format: 'pdf', label: 'PDF (打印)', icon: 'PDF', extension: '.pdf' },
];

/**
 * Calculate menu position using fixed coordinates.
 * Shows above button if there's enough space, otherwise below.
 */
function calculateMenuPosition(): { left: number; top: string } {
  if (!buttonRef.value) return { left: 0, top: '0px' };

  const rect = buttonRef.value.getBoundingClientRect();
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  const menuHeight = 160; // ~4 options

  let top: string;
  if (spaceAbove >= menuHeight) {
    // Show above button
    top = `${rect.top - 4}px`;
  } else if (spaceBelow >= menuHeight) {
    // Show below button
    top = `${rect.bottom + 4}px`;
  } else {
    // Not enough space either way - show above, let it scroll
    top = `${Math.max(8, rect.top - menuHeight)}px`;
  }

  return {
    left: rect.left,
    top,
  };
}

function toggleMenu(): void {
  isOpen.value = !isOpen.value;
}

watch(isOpen, async (val) => {
  if (val) {
    await nextTick();
    const pos = calculateMenuPosition();
    menuLeft.value = pos.left;
    menuTop.value = pos.top;
  }
});

function handleClickOutside(e: MouseEvent) {
  if (!isOpen.value) return;
  if (buttonRef.value && !buttonRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
}

function handleEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('keydown', handleEsc);
  // Find teleport target
  const bodyEl = document.body;
  teleportTarget.value = bodyEl?.id ? bodyEl.id : 'body';
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('keydown', handleEsc);
});

async function handleExport(format: ExportFormat): Promise<void> {
  isOpen.value = false;
  isExporting.value = true;

  try {
    await exportThread(props.thread, format, {
      includeToolCalls: true,
      includeTimestamps: true,
    });
  } catch (error) {
    console.error(`[ExportButton] Failed to export as ${format}:`, error);
    alert(`导出失败: ${error instanceof Error ? error.message : '未知错误'}`);
  } finally {
    isExporting.value = false;
  }
}
</script>

<style scoped>
.export-menu-enter-active,
.export-menu-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.export-menu-enter-from,
.export-menu-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
