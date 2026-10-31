import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Proof screenshots are private: they are only ever served through an
// organizer-authenticated route, never from a public bucket URL. Bills are
// served to the organizer and to anyone holding the event's invite code.

const LOCAL_ROOT = path.join(process.cwd(), "uploads");

async function gcsBucket() {
  const { Storage } = await import("@google-cloud/storage");
  return new Storage().bucket(process.env.GCS_BUCKET!);
}

export async function putObject(key: string, data: Buffer, contentType: string): Promise<void> {
  if (process.env.STORAGE_DRIVER === "gcs") {
    await (await gcsBucket()).file(key).save(data, { contentType, resumable: false });
    return;
  }
  const file = path.join(LOCAL_ROOT, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

export async function getObject(key: string): Promise<Buffer> {
  if (process.env.STORAGE_DRIVER === "gcs") {
    const [data] = await (await gcsBucket()).file(key).download();
    return data;
  }
  const file = path.resolve(LOCAL_ROOT, key);
  if (!file.startsWith(LOCAL_ROOT)) throw new Error("invalid key");
  return readFile(file);
}

export async function deleteObject(key: string): Promise<void> {
  if (process.env.STORAGE_DRIVER === "gcs") {
    await (await gcsBucket()).file(key).delete({ ignoreNotFound: true });
    return;
  }
  const file = path.resolve(LOCAL_ROOT, key);
  if (!file.startsWith(LOCAL_ROOT + path.sep)) throw new Error("invalid key");
  await rm(file, { force: true });
}

/** Removes every object under a folder-like prefix, e.g. all proofs of one event. */
export async function deletePrefix(prefix: string): Promise<void> {
  if (process.env.STORAGE_DRIVER === "gcs") {
    await (await gcsBucket()).deleteFiles({ prefix });
    return;
  }
  const dir = path.resolve(LOCAL_ROOT, prefix);
  if (!dir.startsWith(LOCAL_ROOT + path.sep)) throw new Error("invalid prefix");
  await rm(dir, { recursive: true, force: true });
}
