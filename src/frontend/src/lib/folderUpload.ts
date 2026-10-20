export interface UploadEntry { file: File; relativePath: string }
export const pickerUploads = (files: File[]): UploadEntry[] => files.map(file => ({ file, relativePath: file.webkitRelativePath || '' }));

/** Directory readers return batches (often 100 entries); read until an empty batch. */
export async function droppedUploads(transfer: DataTransfer) {
  const entries = Array.from(transfer.items || []).filter(item => item.kind === 'file').map(item => item.webkitGetAsEntry?.());
  const files: UploadEntry[] = [];
  const emptyDirectories: string[] = [];
  async function visit(entry: FileSystemEntry, prefix = '') {
    const relativePath = prefix + entry.name;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      files.push({ file, relativePath });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let count = 0;
      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        count += batch.length;
        for (const child of batch) await visit(child, relativePath + '/');
      }
      if (!count) emptyDirectories.push(relativePath);
    }
  }
  if (entries.length && entries.every(Boolean)) for (const entry of entries) await visit(entry);
  else files.push(...pickerUploads(Array.from(transfer.files)));
  return { files, emptyDirectories };
}
