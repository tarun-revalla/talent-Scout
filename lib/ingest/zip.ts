import AdmZip from "adm-zip";

export interface ZipEntry {
  name: string;
  buffer: Buffer;
}

const MAX_ZIP_ENTRIES = 100;
const MAX_ZIP_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB uncompressed

export function unzip(buf: Buffer): ZipEntry[] {
  const zip = new AdmZip(buf);
  const entries = zip
    .getEntries()
    .filter((e) => !e.isDirectory && !e.entryName.startsWith("__MACOSX/"));
  if (entries.length > MAX_ZIP_ENTRIES) {
    throw new Error(`ZIP contains too many files (${entries.length} > ${MAX_ZIP_ENTRIES})`);
  }

  const out: ZipEntry[] = [];
  let totalBytes = 0;
  for (const e of entries) {
    const data = e.getData();
    totalBytes += data.length;
    if (totalBytes > MAX_ZIP_TOTAL_BYTES) {
      throw new Error(
        `ZIP uncompressed size exceeds ${MAX_ZIP_TOTAL_BYTES / 1024 / 1024} MB limit`,
      );
    }
    out.push({ name: e.entryName, buffer: data });
  }
  return out;
}
