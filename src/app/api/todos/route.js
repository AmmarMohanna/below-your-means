import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  getAllTodoItems,
  addTodoItem,
  updateTodoItem,
  deleteTodoItem,
} from "@/lib/db";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const todos = getAllTodoItems();
    return NextResponse.json(todos);
  } catch (error) {
    console.error("Error fetching todos:", error);
    return NextResponse.json({ error: "Failed to fetch todos" }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const title = (body.title || "").trim();

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const result = addTodoItem({ title });
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error("Error creating todo:", error);
    return NextResponse.json({ error: "Failed to create todo" }, { status: 500 });
  }
}

export async function PUT(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const id = parseInt(body.id, 10);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Valid todo id is required" }, { status: 400 });
    }

    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    if (title !== undefined && !title) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }

    updateTodoItem(id, {
      title,
      completed: body.completed,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating todo:", error);
    return NextResponse.json({ error: "Failed to update todo" }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get("id"), 10);

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Valid todo id is required" }, { status: 400 });
    }

    deleteTodoItem(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting todo:", error);
    return NextResponse.json({ error: "Failed to delete todo" }, { status: 500 });
  }
}
