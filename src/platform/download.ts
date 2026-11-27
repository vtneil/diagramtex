/** Local export destinations; rendering and document state stay with their callers. */
export function downloadBlob(name: string, blob: Blob) {
  const link = document.createElement('a');
  link.download = name; link.href = URL.createObjectURL(blob);
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}
export interface ExportDirectory { name: string }
/** How an export landed, for the caller to say in its own words: written into the linked folder, downloaded, or
 *  downloaded because the folder failed or was not allowed */
export type ExportOutcome =
  | { kind: 'saved'; name: string; folder: string }
  | { kind: 'downloaded'; name: string }
  | { kind: 'folderFailed'; name: string; folder: string; error: string }
  | { kind: 'noAccess'; name: string; folder: string };
export function createExportWriter(files: {
  dirOf(id: string | null): ExportDirectory | null | undefined;
  exportDir(id: string | null): Promise<ExportDirectory | null>;
  writeIn(directory: ExportDirectory, name: string, data: Blob): Promise<void>;
}, documentId: () => string | null, report: (outcome: ExportOutcome) => void) {
  return async function writeExport(name: string, data: Blob | BlobPart, type?: string) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const directory = files.dirOf(documentId()) && await files.exportDir(documentId());
    // a folder that failed or wasn't allowed says "downloaded instead" itself, so that is the one report
    if (directory) {
      try { await files.writeIn(directory, name, blob); report({ kind: 'saved', name, folder: directory.name }); return; }
      catch (error: any) { downloadBlob(name, blob); report({ kind: 'folderFailed', name, folder: directory.name, error: (error as Error).message }); return; }
    }
    const folder = files.dirOf(documentId());
    downloadBlob(name, blob);
    report(folder ? { kind: 'noAccess', name, folder: folder.name } : { kind: 'downloaded', name });
  };
}

/** Save a picture the document holds. Only image data and ordinary web addresses are followed: a document can come
 * from anyone, and a javascript: or other scheme in an anchor would run or open something instead of saving. */
export function downloadImage(src: string, name: string) {
  const url = String(src || '').trim();
  if (!/^(data:image\/|blob:|https?:)/i.test(url) && /^[a-z][\w+.-]*:/i.test(url)) return false;
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  return true;
}
