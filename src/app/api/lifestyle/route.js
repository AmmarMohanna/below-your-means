import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import {
  getPrayers,
  updatePrayer,
  setPrayers,
  getAllGymPayments,
  addGymPayment,
  deleteGymPayment,
  getAllGymSessions,
  addGymSession,
  deleteGymSession,
} from "@/lib/db";

// GET - fetch all lifestyle data
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const prayers = await getPrayers();
    const gymPayments = await getAllGymPayments();
    const gymSessions = await getAllGymSessions();

    return NextResponse.json({
      prayers,
      gymPayments,
      gymSessions,
    });
  } catch (error) {
    console.error("Error fetching lifestyle data:", error);
    return NextResponse.json(
      { error: "Failed to fetch lifestyle data" },
      { status: 500 }
    );
  }
}

// POST - add new data
export async function POST(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, ...data } = body;

    switch (type) {
      case "gymPayment":
        await addGymPayment(data);
        break;
      case "gymSession":
        await addGymSession(data);
        break;
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding lifestyle data:", error);
    return NextResponse.json(
      { error: "Failed to add lifestyle data" },
      { status: 500 }
    );
  }
}

// PUT - update prayer count or set prayers
export async function PUT(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, prayer, delta, prayers } = body;

    if (type === "prayer" && prayer && delta !== undefined) {
      await updatePrayer(prayer, delta);
    } else if (type === "setPrayers" && prayers) {
      await setPrayers(prayers);
    } else {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating lifestyle data:", error);
    return NextResponse.json(
      { error: "Failed to update lifestyle data" },
      { status: 500 }
    );
  }
}

// DELETE - remove data
export async function DELETE(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const id = parseInt(searchParams.get("id"));

    if (!type || !id) {
      return NextResponse.json(
        { error: "Missing type or id" },
        { status: 400 }
      );
    }

    switch (type) {
      case "gymPayment":
        await deleteGymPayment(id);
        break;
      case "gymSession":
        await deleteGymSession(id);
        break;
      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting lifestyle data:", error);
    return NextResponse.json(
      { error: "Failed to delete lifestyle data" },
      { status: 500 }
    );
  }
}
