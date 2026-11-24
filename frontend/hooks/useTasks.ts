"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyLive, subscribeLive } from "@/lib/live";
import { fetchTasks } from "@/lib/api";
import { Task, TaskStatus } from "@/lib/types";

interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  applyLocalUpdate: (task: Task) => void;
  revertLocalStatus: (taskId: string, status: TaskStatus) => void;
  removeLocal: (taskId: string) => void;
}

/**
 * 初期ロードはREST（/api/tasks）、以降の変更反映はバックエンドのリアルタイム配信で受ける。
 * 楽観的更新はこのフックの外（TaskBoard側）で行い、ここは「サーバー状態の反映」に専念する。
 */
export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchTasks();
      setTasks(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "タスク取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    return subscribeLive(
      "tasks",
      (event, row) => setTasks((prev) => applyLive(prev, event, row)),
      () => {
        fetchTasks().then(setTasks).catch(() => {});
      }
    );
  }, []);

  // カンバンの楽観的更新用。Realtime反映が届くまでのつなぎとして即座にローカルstateへ反映する。
  const applyLocalUpdate = useCallback((task: Task) => {
    setTasks((prev) => {
      const exists = prev.some((t) => t.id === task.id);
      return exists
        ? prev.map((t) => (t.id === task.id ? task : t))
        : [task, ...prev];
    });
  }, []);

  // 楽観的更新がAPIエラーで失敗した場合のロールバック（ステータスのみ）。
  const revertLocalStatus = useCallback((taskId: string, status: TaskStatus) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status } : t))
    );
  }, []);

  const removeLocal = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  return { tasks, loading, error, reload, applyLocalUpdate, revertLocalStatus, removeLocal };
}
