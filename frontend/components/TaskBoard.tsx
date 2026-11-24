"use client";

import { useState } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  DropResult,
} from "@hello-pangea/dnd";
import {
  Task,
  TaskStatus,
  TASK_DOMAIN_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TASK_REPEAT_LABELS,
} from "@/lib/types";
import { updateTaskStatus } from "@/lib/api";
import { DOMAIN_TAG_CLASSES, DUE_BADGE_CLASSES, dueLabel, dueState } from "@/lib/taskUi";

interface TaskBoardProps {
  tasks: Task[];
  /** 楽観的更新・Realtime確定更新の両方をこの1関数で受ける（呼び出し側は applyLocalUpdate を渡す） */
  onTaskUpdated: (task: Task) => void;
  /** API失敗時のロールバック（呼び出し側は revertLocalStatus を渡す） */
  onTaskUpdateFailed: (taskId: string, revertToStatus: TaskStatus, message: string) => void;
  onOpenTask: (task: Task) => void;
  onAddToColumn: (status: TaskStatus) => void;
}

/** 期限が近い順（期限なしは最後）。同じ期限なら新しい順のまま。 */
function sortByDue(a: Task, b: Task): number {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return 0;
}

function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const grouped: Record<TaskStatus, Task[]> = {
    todo: [],
    in_progress: [],
    review: [],
    done: [],
  };
  for (const task of tasks) {
    grouped[task.status].push(task);
  }
  for (const status of TASK_STATUS_ORDER) grouped[status].sort(sortByDue);
  return grouped;
}

export function TaskCardBody({ task }: { task: Task }) {
  const due = dueState(task);
  return (
    <>
      <p className={`font-medium wrap-break-word ${task.status === "done" ? "text-label-2 line-through" : ""}`}>
        {task.title}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
        {task.domain && (
          <span className={`rounded-sm px-1.5 py-0.5 ${DOMAIN_TAG_CLASSES[task.domain]}`}>
            {TASK_DOMAIN_LABELS[task.domain]}
          </span>
        )}
        {task.due_date && due !== "none" && (
          <span className={`rounded-sm px-1.5 py-0.5 ${DUE_BADGE_CLASSES[due]}`}>
            {dueLabel(task)}
          </span>
        )}
        {task.due_date && due === "none" && (
          <span className="text-label-3">{dueLabel(task)}</span>
        )}
        {task.repeat && <span className="text-label-2">↻{TASK_REPEAT_LABELS[task.repeat]}</span>}
        <span className="ml-auto text-label-2">
          {!!task.checklist?.length && (
            <span className="mr-2 tabular-nums text-label-2">
              ☑ {task.checklist.filter((c) => c.done).length}/{task.checklist.length}
            </span>
          )}
          {task.assignee_name ?? <span className="text-label-3">未割当</span>}
        </span>
      </div>
    </>
  );
}

export default function TaskBoard({
  tasks,
  onTaskUpdated,
  onTaskUpdateFailed,
  onOpenTask,
  onAddToColumn,
}: TaskBoardProps) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const grouped = groupByStatus(tasks);

  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const newStatus = destination.droppableId as TaskStatus;
    const previousStatus = source.droppableId as TaskStatus;
    const task = tasks.find((t) => t.id === draggableId);
    if (!task) return;

    // 楽観的更新: 親側のstateはSupabase Realtimeのイベントでも更新されるため、
    // ここでは即時反映だけ行い、失敗時に呼び出し元でロールバックする。
    onTaskUpdated({ ...task, status: newStatus });
    setPendingIds((prev) => new Set(prev).add(task.id));

    try {
      const updated = await updateTaskStatus(task.id, newStatus);
      onTaskUpdated(updated);
    } catch (err) {
      onTaskUpdateFailed(
        task.id,
        previousStatus,
        err instanceof Error ? err.message : "状態を変更できませんでした"
      );
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {/* モバイルは列を横スクロール（1列ずつスナップ）、md以上は4列グリッド */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0">
        {TASK_STATUS_ORDER.map((status) => (
          <Droppable droppableId={status} key={status}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`w-[82vw] max-w-xs shrink-0 snap-start rounded-2xl p-3 min-h-[200px] transition-colors md:w-auto md:max-w-none ${
                  snapshot.isDraggingOver ? "bg-fill-strong" : "bg-fill"
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-label">
                    {TASK_STATUS_LABELS[status]}{" "}
                    <span className="text-label-3">({grouped[status].length})</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => onAddToColumn(status)}
                    aria-label={`${TASK_STATUS_LABELS[status]}にタスクを追加`}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-[20px] leading-none text-accent active:bg-fill"
                  >
                    +
                  </button>
                </div>

                <div className="space-y-2">
                  {grouped[status].map((task, index) => (
                    <Draggable draggableId={task.id} index={index} key={task.id}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          onClick={() => onOpenTask(task)}
                          onKeyDown={(e) => {
                            // Space はキーボードドラッグに使われるため、編集は Enter で開く
                            if (e.key === "Enter") onOpenTask(task);
                          }}
                          title="クリックで編集・ドラッグで移動"
                          className={`cursor-pointer rounded-xl bg-card p-3 text-[15px] shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${
                            dragSnapshot.isDragging ? "shadow-md" : ""
                          } ${pendingIds.has(task.id) ? "opacity-60" : ""} ${
                            dueState(task) === "overdue" ? "border-l-4 border-p-red-bar" : ""
                          }`}
                        >
                          <TaskCardBody task={task} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              </div>
            )}
          </Droppable>
        ))}
      </div>
    </DragDropContext>
  );
}
