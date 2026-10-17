import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getAttachment, isImage } from "@/server/services/attachments";

/** The file itself, to its owner only. Images display inline; everything else downloads. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser().catch(() => null);
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return new Response("Not found", { status: 404 });
  const a = await getAttachment(userId, id.data);
  if (!a) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.has("download") || !isImage(a.mime);
  return new Response(new Uint8Array(a.data), {
    headers: {
      "Content-Type": a.mime,
      "Content-Length": String(a.data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
