"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import BottomNav from "@/components/BottomNav";

import styles from "./todo.module.css";

export default function TodoPage() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTodo, setNewTodo] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const router = useRouter();

  const fetchTodos = useCallback(async () => {
    try {
      const response = await fetch("/api/todos");
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        throw new Error("Failed to fetch todos");
      }

      const data = await response.json();
      setTodos(data || []);
    } catch (error) {
      console.error("Todo fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const activeCount = useMemo(() => todos.filter((todo) => !todo.completed).length, [todos]);
  const doneCount = todos.length - activeCount;

  const handleAddTodo = async () => {
    const title = newTodo.trim();
    if (!title) return;

    try {
      const response = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) {
        throw new Error("Failed to create todo");
      }

      setNewTodo("");
      await fetchTodos();
    } catch (error) {
      console.error("Todo add error:", error);
    }
  };

  const handleToggleTodo = async (todo) => {
    try {
      const response = await fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: todo.id, completed: !todo.completed }),
      });

      if (!response.ok) {
        throw new Error("Failed to update todo");
      }

      await fetchTodos();
    } catch (error) {
      console.error("Todo toggle error:", error);
    }
  };

  const startEdit = (todo) => {
    setEditingId(todo.id);
    setEditingTitle(todo.title);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const saveEdit = async () => {
    const title = editingTitle.trim();
    if (!title || !editingId) return;

    try {
      const response = await fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, title }),
      });

      if (!response.ok) {
        throw new Error("Failed to save todo");
      }

      cancelEdit();
      await fetchTodos();
    } catch (error) {
      console.error("Todo edit error:", error);
    }
  };

  const deleteTodo = async (id) => {
    try {
      const response = await fetch(`/api/todos?id=${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Failed to delete todo");
      }
      await fetchTodos();
    } catch (error) {
      console.error("Todo delete error:", error);
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Task List</p>
        <h1 className={styles.title}>Todo</h1>
        <div className={styles.stats}>
          <span className={styles.statPill}>{activeCount} active</span>
          <span className={styles.statPillDone}>{doneCount} done</span>
        </div>
      </header>

      <section className={styles.addSection}>
        <input
          type="text"
          placeholder="Add a todo..."
          value={newTodo}
          onChange={(event) => setNewTodo(event.target.value)}
          className={styles.input}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleAddTodo();
            }
          }}
        />
        <button type="button" className={styles.addBtn} onClick={handleAddTodo}>
          + Add
        </button>
      </section>

      <section className={styles.listSection}>
        {todos.length === 0 ? (
          <div className={styles.emptyState}>No todos yet.</div>
        ) : (
          todos.map((todo) => (
            <article
              key={todo.id}
              className={`${styles.todoItem} ${todo.completed ? styles.todoDone : ""}`}
            >
              <button
                type="button"
                className={`${styles.checkBtn} ${todo.completed ? styles.checked : ""}`}
                onClick={() => handleToggleTodo(todo)}
                aria-label={todo.completed ? "Mark as not done" : "Mark as done"}
              >
                {todo.completed ? "✓" : ""}
              </button>

              {editingId === todo.id ? (
                <input
                  type="text"
                  value={editingTitle}
                  onChange={(event) => setEditingTitle(event.target.value)}
                  className={styles.editInput}
                  autoFocus
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveEdit();
                    if (event.key === "Escape") cancelEdit();
                  }}
                />
              ) : (
                <span className={styles.todoTitle}>{todo.title}</span>
              )}

              <div className={styles.actions}>
                {editingId === todo.id ? (
                  <>
                    <button type="button" className={styles.actionBtn} onClick={saveEdit}>
                      Save
                    </button>
                    <button type="button" className={styles.actionBtn} onClick={cancelEdit}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className={styles.actionBtn} onClick={() => startEdit(todo)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={() => deleteTodo(todo.id)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </article>
          ))
        )}
      </section>

      <BottomNav active="todo" />
    </div>
  );
}
