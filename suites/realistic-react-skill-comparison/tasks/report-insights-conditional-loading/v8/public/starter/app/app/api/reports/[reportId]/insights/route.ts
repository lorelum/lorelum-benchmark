import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return NextResponse.json({ reportId, series: [3, 5, 8, 13], internalNote: "Internal report insights payload" });
}
