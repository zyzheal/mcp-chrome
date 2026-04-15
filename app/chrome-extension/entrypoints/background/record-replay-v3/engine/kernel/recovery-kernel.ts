/**
 * @fileoverview 支持崩溃恢复的 ExecutionKernel 实现 (P3-06)
 * @description
 * 提供 ExecutionKernel 的恢复增强实现，支持 `recover()` 方法。
 * 通过委托给 RecoveryCoordinator 实现崩溃恢复。
 *
 * 其他执行方法委托给 RunRunner 实例。
 */

import type { UnixMillis } from '../../domain/json';
import type { FlowId, NodeId, RunId } from '../../domain/ids';
import type { DebuggerCommand, DebuggerState } from '../../domain/debug';
import type { FlowV3 } from '../../domain/flow';
import type { JsonObject } from '../../domain/json';
import type { RunEvent, Unsubscribe } from '../../domain/events';

import type { StoragePort } from '../storage/storage-port';
import type { EventsBus } from '../transport/events-bus';
import { recoverFromCrash } from '../recovery/recovery-coordinator';
import { createRunRunnerFactory, type RunRunnerFactory } from './runner';
import { createRunnerRegistry, type RunnerRegistry } from './debug-controller';
import { createDebugController, type DebugController } from './debug-controller';
import { createChromeArtifactService } from './artifacts';
import { PluginRegistry } from '../plugins/registry';
import {
  registerV2ReplayNodesAsV3Nodes,
  DEFAULT_V2_EXCLUDE_LIST,
} from '../plugins/register-v2-replay-nodes';

import type { ExecutionKernel, RunStartRequest, RunStatusInfo, RunResult } from './kernel';

// ==================== Types ====================

/**
 * 支持恢复的 Kernel 依赖
 */
export interface RecoveryEnabledKernelDeps {
  /** 存储层 */
  storage: StoragePort;
  /** 事件总线 */
  events: EventsBus;
  /** 当前 Service Worker 的 ownerId */
  ownerId: string;
  /** 时间源 */
  now?: () => UnixMillis;
  /** 日志器 */
  logger?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
}

// ==================== Factory ====================

/**
 * 创建支持恢复的 ExecutionKernel
 * @description
 * 此实现支持所有 ExecutionKernel 方法：
 * - `recover()`: 崩溃恢复
 * - `startRun/pauseRun/resumeRun/cancelRun`: 委托给 RunRunner
 * - `debug`: 委托给 DebugController
 * - `getRunStatus`: 从存储读取
 */
export function createRecoveryEnabledKernel(deps: RecoveryEnabledKernelDeps): ExecutionKernel {
  const logger = deps.logger ?? console;
  const now = deps.now ?? (() => Date.now());

  if (!deps.ownerId) {
    throw new Error('ownerId is required');
  }

  // 创建 PluginRegistry 并注册 V2 action handlers
  const plugins = new PluginRegistry();
  registerV2ReplayNodesAsV3Nodes(plugins, {
    exclude: [...DEFAULT_V2_EXCLUDE_LIST],
  });

  // 创建 RunRunner 工厂
  const runnerFactory: RunRunnerFactory = createRunRunnerFactory({
    storage: deps.storage,
    events: deps.events,
    plugins,
    artifactService: createChromeArtifactService(),
    now,
  });

  // 创建 RunnerRegistry 和 DebugController
  const runners: RunnerRegistry = createRunnerRegistry();
  const debugController: DebugController = createDebugController({
    storage: deps.storage,
    events: deps.events,
    runners,
  });

  // 事件监听器集合
  const eventListeners = new Set<(event: RunEvent) => void>();

  return {
    // 订阅事件
    onEvent: (listener: (event: RunEvent) => void): Unsubscribe => {
      eventListeners.add(listener);
      deps.events.subscribe((event) => {
        // 转发事件给所有监听器
        for (const l of eventListeners) {
          try {
            l(event);
          } catch (e) {
            logger.error('[RecoveryKernel] Event listener error:', e);
          }
        }
      });

      // 返回取消订阅函数
      return () => {
        eventListeners.delete(listener);
      };
    },

    // 启动 Run
    startRun: async (req: RunStartRequest): Promise<void> => {
      logger.info('[RecoveryKernel] Starting run:', req.runId);

      // 创建 RunRunner
      const runner = runnerFactory.create(req.runId, {
        flow: req.flowSnapshot,
        tabId: req.tabId,
        args: req.args,
        startNodeId: req.startNodeId,
        debug: req.debug,
      });

      // 注册到 runners registry
      runners.register(req.runId, runner);

      // 启动执行
      runner.start().catch((error) => {
        logger.error('[RecoveryKernel] Run failed:', error);
      });
    },

    // 暂停 Run
    pauseRun: async (runId: RunId, _reason?: { kind: 'command' }): Promise<void> => {
      logger.info('[RecoveryKernel] Pausing run:', runId);

      const runner = runners.get(runId);
      if (!runner) {
        throw new Error(`Run ${runId} not found`);
      }

      runner.pause();
    },

    // 恢复 Run
    resumeRun: async (runId: RunId): Promise<void> => {
      logger.info('[RecoveryKernel] Resuming run:', runId);

      const runner = runners.get(runId);
      if (!runner) {
        throw new Error(`Run ${runId} not found`);
      }

      runner.resume();
    },

    // 取消 Run
    cancelRun: async (runId: RunId, reason?: string): Promise<void> => {
      logger.info('[RecoveryKernel] Canceling run:', runId, reason);

      const runner = runners.get(runId);
      if (!runner) {
        throw new Error(`Run ${runId} not found`);
      }

      runner.cancel(reason);
    },

    // 调试命令
    debug: async (
      runId: RunId,
      cmd: DebuggerCommand,
    ): Promise<{ ok: true; state?: DebuggerState } | { ok: false; error: string }> => {
      // 将 runId 注入到命令中（如果需要）
      const cmdWithRunId = { ...cmd, runId } as DebuggerCommand;
      const result = await debugController.handle(cmdWithRunId);

      if (result.ok) {
        return { ok: true, state: result.state };
      } else {
        return { ok: false, error: result.error };
      }
    },

    // 获取 Run 状态
    getRunStatus: async (runId: RunId): Promise<RunStatusInfo | null> => {
      const run = await deps.storage.runs.get(runId);
      if (!run) return null;
      return {
        status: run.status,
        currentNodeId: run.currentNodeId,
        startedAt: run.startedAt,
        updatedAt: run.updatedAt,
        tabId: run.tabId,
      };
    },

    // 崩溃恢复
    recover: async (): Promise<void> => {
      logger.info('[RecoveryKernel] Starting crash recovery...');
      const result = await recoverFromCrash({
        storage: deps.storage,
        events: deps.events,
        ownerId: deps.ownerId,
        now,
        logger,
      });
      logger.info('[RecoveryKernel] Recovery complete:', result);
    },
  };
}
