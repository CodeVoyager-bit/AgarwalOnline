import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { storeEvidence } from "@/lib/evidence/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  try {
    const form = await request.formData();
    const evidence = await storeEvidence(user.id, {
      file: form.get("file") as File,
      purpose: form.get("purpose"),
      orderId: form.get("orderId"),
      complaintId: form.get("complaintId"),
      productId: form.get("productId"),
    });
    return NextResponse.json(
      { id: String(evidence._id), url: evidence.url },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    const status = message === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json(
      { error: status === 403 ? "You cannot attach evidence here." : message },
      { status },
    );
  }
}
