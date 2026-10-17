import { requireUser } from "@/server/auth";
import { publicError } from "@/server/errors";
import { MAX_UPLOAD_BYTES, saveUpload } from "@/server/services/attachments";

/** Upload one file for an Ask message (multipart field "file"). It's attached when the message is sent. */
export async function POST(req: Request) {
  const userId = await requireUser().catch(() => null);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Files can be up to 4 MB." }, { status: 413 });
  try {
    const saved = await saveUpload(userId, { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) });
    return Response.json(saved);
  } catch (err) {
    return Response.json({ error: publicError(err) }, { status: 400 });
  }
}
