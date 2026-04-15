/**
 * @fileoverview V2 数据读取器
 * @description 从 V2 IndexedDB 存储读取 flows/runs/triggers/schedules 数据
 */

import {
  IndexedDbStorage,
  ensureMigratedFromLocal,
} from '../../../record-replay/storage/indexeddb-manager';
import type { Flow, RunRecord } from '../../../record-replay/types';
import type { FlowSchedule } from '../../../record-replay/flow-store';
import type { FlowTrigger } from '../../../record-replay/trigger-store';

/**
 * V2 数据读取器接口
 */
export interface V2Reader {
  /** 读取 V2 Flows */
  readFlows(): Promise<Flow[]>;
  /** 读取 V2 Runs */
  readRuns(): Promise<RunRecord[]>;
  /** 读取 V2 Triggers */
  readTriggers(): Promise<FlowTrigger[]>;
  /** 读取 V2 Schedules */
  readSchedules(): Promise<FlowSchedule[]>;
}

/**
 * 创建 V2Reader 实例
 * @description 从 V2 IndexedDB 存储读取数据，确保迁移已完成
 */
export function createV2Reader(): V2Reader {
  return {
    async readFlows(): Promise<Flow[]> {
      await ensureMigratedFromLocal();
      return IndexedDbStorage.flows.list();
    },

    async readRuns(): Promise<RunRecord[]> {
      await ensureMigratedFromLocal();
      return IndexedDbStorage.runs.list();
    },

    async readTriggers(): Promise<FlowTrigger[]> {
      await ensureMigratedFromLocal();
      return IndexedDbStorage.triggers.list();
    },

    async readSchedules(): Promise<FlowSchedule[]> {
      await ensureMigratedFromLocal();
      return IndexedDbStorage.schedules.list();
    },
  };
}

/**
 * 创建 NotImplemented 的 V2Reader
 * @deprecated 使用 createV2Reader() 替代
 */
export function createNotImplementedV2Reader(): V2Reader {
  const notImplemented = async () => {
    throw new Error('V2Reader not implemented');
  };

  return {
    readFlows: notImplemented,
    readRuns: notImplemented,
    readTriggers: notImplemented,
    readSchedules: notImplemented,
  };
}
