import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  getAllReminders,
  addReminder,
  updateReminder,
  markReminderDone,
  pauseReminder,
  resumeReminder,
  deleteReminder,
} from "@/lib/db";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const reminders = await getAllReminders();
    return NextResponse.json(reminders);
  } catch (error) {
    console.error("Error fetching reminders:", error);
    return NextResponse.json({ error: "Failed to fetch reminders" }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const title = (body.title || "").trim();
    const intervalHours = parseInt(body.interval_hours, 10);

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (!Number.isInteger(intervalHours) || intervalHours <= 0) {
      return NextResponse.json({ error: "interval_hours must be a positive integer" }, { status: 400 });
    }

    const result = await addReminder({ title, interval_hours: intervalHours });
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    console.error("Error creating reminder:", error);
    return NextResponse.json({ error: "Failed to create reminder" }, { status: 500 });
  }
}

export async function PUT(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const id = parseInt(body.id, 10);
    const action = body.action || "update";

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Valid reminder id is required" }, { status: 400 });
    }

    switch (action) {
      case "done":
        await markReminderDone(id);
        break;
      case "pause":
        await pauseReminder(id);
        break;
      case "resume":
        await resumeReminder(id);
        break;
      case "update": {
        const title = typeof body.title === "string" ? body.title.trim() : undefined;
        const intervalHours = body.interval_hours === undefined
          ? undefined
          : parseInt(body.interval_hours, 10);

        if (title !== undefined && !title) {
          return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
        }
        if (intervalHours !== undefined && (!Number.isInteger(intervalHours) || intervalHours <= 0)) {
          return NextResponse.json({ error: "interval_hours must be a positive integer" }, { status: 400 });
        }

        await updateReminder(id, {
          title,
          interval_hours: intervalHours,
          is_active: body.is_active,
          recalculate_from_now: body.recalculate_from_now === true,
        });
        break;
      }
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating reminder:", error);
    return NextResponse.json({ error: "Failed to update reminder" }, { status: 500 });
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
      return NextResponse.json({ error: "Valid reminder id is required" }, { status: 400 });
    }

    await deleteReminder(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting reminder:", error);
    return NextResponse.json({ error: "Failed to delete reminder" }, { status: 500 });
  }
}
