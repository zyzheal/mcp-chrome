/**
 * @fileoverview 截图工件持久化存储
 * @description 使用 IndexedDB 存储截图数据，避免 Service Worker 重启后丢失
 */

import { openRrV3Db } from './db';

/**
 * Store 名称
 */
export const ARTIFACTS_STORE = 'artifacts';

/**
 * 截图工件记录
 */
export interface ArtifactRecord {
  /** 唯一标识 (runId/filename) */
  id: string;
  /** Run ID */
  runId: string;
  /** Node ID */
  nodeId: string;
  /** 文件名 */
  filename: string;
  /** Base64 编码的截图数据 */
  base64: string;
  /** 创建时间 (ISO 字符串) */
  createdAt: string;
  /** 截图格式 */
  format?: 'png' | 'jpeg';
  /** Tab ID (截图时的标签页) */
  tabId?: number;
}

/**
 * Store 配置
 */
export const ARTIFACTS_STORE_CONFIG = {
  keyPath: 'id',
  indexes: [
    { name: 'runId', keyPath: 'runId' },
    { name: 'nodeId', keyPath: 'nodeId' },
    { name: 'createdAt', keyPath: 'createdAt' },
  ],
};

/**
 * 保存截图到 IndexedDB
 */
export async function saveArtifact(artifact: ArtifactRecord): Promise<void> {
  const db = await openRrV3Db();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([ARTIFACTS_STORE], 'readwrite');
    const store = tx.objectStore(ARTIFACTS_STORE);

    const request = store.put(artifact);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => {
      // Transaction completed successfully
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

/**
 * 根据 ID 获取截图
 */
export async function getArtifact(id: string): Promise<ArtifactRecord | undefined> {
  const db = await openRrV3Db();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([ARTIFACTS_STORE], 'readonly');
    const store = tx.objectStore(ARTIFACTS_STORE);

    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 根据 Run ID 获取所有截图
 */
export async function getArtifactsByRun(runId: string): Promise<ArtifactRecord[]> {
  const db = await openRrV3Db();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([ARTIFACTS_STORE], 'readonly');
    const store = tx.objectStore(ARTIFACTS_STORE);
    const index = store.index('runId');

    const request = index.getAll(runId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 根据 Run ID 和 Node ID 获取截图
 */
export async function getArtifactsByRunAndNode(
  runId: string,
  nodeId: string,
): Promise<ArtifactRecord[]> {
  const artifacts = await getArtifactsByRun(runId);
  return artifacts.filter((a) => a.nodeId === nodeId);
}

/**
 * 删除截图
 */
export async function deleteArtifact(id: string): Promise<void> {
  const db = await openRrV3Db();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([ARTIFACTS_STORE], 'readwrite');
    const store = tx.objectStore(ARTIFACTS_STORE);

    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);

    tx.oncomplete = () => {
      // Transaction completed successfully
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

/**
 * 删除某个 Run 的所有截图
 */
export async function deleteArtifactsByRun(runId: string): Promise<void> {
  const artifacts = await getArtifactsByRun(runId);

  const db = await openRrV3Db();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([ARTIFACTS_STORE], 'readwrite');
    const store = tx.objectStore(ARTIFACTS_STORE);

    for (const artifact of artifacts) {
      store.delete(artifact.id);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

/**
 * 列出所有截图（支持分页）
 */
export async function listArtifacts(options?: {
  limit?: number;
  offset?: number;
}): Promise<ArtifactRecord[]> {
  const db = await openRrV3Db();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([ARTIFACTS_STORE], 'readonly');
    const store = tx.objectStore(ARTIFACTS_STORE);
    const index = store.index('createdAt');

    const request = index.getAll();
    request.onsuccess = () => {
      let results = request.result || [];

      // 按创建时间倒序
      results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // 应用分页
      const offset = options?.offset || 0;
      const limit = options?.limit || 100;
      results = results.slice(offset, offset + limit);

      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 清理过期截图（超过指定天数）
 */
export async function cleanupOldArtifacts(daysOld: number): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  const cutoffIso = cutoffDate.toISOString();

  const artifacts = await listArtifacts();
  const oldArtifacts = artifacts.filter((a) => a.createdAt < cutoffIso);

  if (oldArtifacts.length === 0) {
    return 0;
  }

  const db = await openRrV3Db();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([ARTIFACTS_STORE], 'readwrite');
    const store = tx.objectStore(ARTIFACTS_STORE);

    for (const artifact of oldArtifacts) {
      store.delete(artifact.id);
    }

    tx.oncomplete = () => resolve(oldArtifacts.length);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}
