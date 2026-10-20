import { describe, expect, it } from 'vitest';
import { droppedUploads } from './folderUpload';
const fileEntry = (name: string) => ({ name, isFile: true, isDirectory: false, file: (resolve) => resolve(new File(['data'], name)) });
const directory = (name: string, batches: any[][]) => ({ name, isFile: false, isDirectory: true, createReader: () => { let index = 0; return { readEntries: resolve => resolve(batches[index++] || []) }; } });
it('recursively reads every batch and preserves empty directories', async () => {
  const entry = directory('Essentials', [[fileEntry('config.yml')], [directory('nested', [[fileEntry('other.yml')]]), directory('empty', [])]]);
  const transfer = { items: [{ kind: 'file', webkitGetAsEntry: () => entry }], files: [] } as unknown as DataTransfer;
  const result = await droppedUploads(transfer);
  expect(result.files.map(file => file.relativePath)).toEqual(['Essentials/config.yml', 'Essentials/nested/other.yml']);
  expect(result.emptyDirectories).toEqual(['Essentials/empty']);
});
