/** Local export destinations; rendering and document state stay with their callers. */
export function downloadBlob(name: string, blob: Blob) {
  const link = document.createElement('a');
  link.download = name; link.href = URL.createObjectURL(blob);
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}
export interface ExportDirectory { name: string }
export function createExportWriter(files: {
  dirOf(id: string | null): ExportDirectory | null | undefined;
  exportDir(id: string | null): Promise<ExportDirectory | null>;
  writeIn(directory: ExportDirectory, name: string, data: Blob): Promise<void>;
}, documentId: () => string | null, hint: (message: string, duration: number) => void) {
  return async function writeExport(name: string, data: Blob | BlobPart, type?: string) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const directory = files.dirOf(documentId()) && await files.exportDir(documentId());
    if (directory) {
      try { await files.writeIn(directory, name, blob); hint(`Saved ${name} to ${directory.name}`, 1600); return; }
      catch (error: any) { hint(`Couldn't save to ${directory.name} (${(error as Error).message}). Downloaded instead.`, 3000); }
    } else if (files.dirOf(documentId())) hint(`No access to ${files.dirOf(documentId())!.name}. Downloaded instead.`, 2500);
    downloadBlob(name, blob);
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
