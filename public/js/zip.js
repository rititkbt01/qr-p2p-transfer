// zip.js — folder structure preservation.
//
// A picked folder becomes one zip (relative paths preserved) so it survives the
// transfer as a single file with progress tracking, instead of a flat pile of
// individually-named files. JSZip is loaded once via CDN <script> in index.html —
// this module is a thin, focused wrapper around it, not a build dependency.

export async function zipFiles(fileList, folderName, onProgress) {
  const zip = new window.JSZip();
  for (const file of fileList) {
    const relPath = file.webkitRelativePath || file.name;
    zip.file(relPath, file);
  }
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (metadata) => {
      if (onProgress) onProgress(metadata.percent);
    }
  );
  return new File([blob], `${folderName || 'folder'}.zip`, { type: 'application/zip' });
}

// The File System Access API (Chromium desktop today) lets us write a real folder
// tree back to disk. Where it's unavailable, the caller should fall back to a plain
// "Save" of the .zip — every OS can already extract a zip on double-click.
export function canExtractToDisk() {
  return typeof window.showDirectoryPicker === 'function';
}

export async function extractZipToDisk(blob) {
  const dirHandle = await window.showDirectoryPicker();
  const zip = await window.JSZip.loadAsync(blob);
  const entries = Object.values(zip.files);
  let written = 0;

  for (const entry of entries) {
    if (entry.dir) continue;
    const parts = entry.name.split('/').filter(Boolean);
    let dir = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: true });
    }
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await fileHandle.createWritable();
    const content = await entry.async('blob');
    await writable.write(content);
    await writable.close();
    written++;
  }
  return written;
}

export async function listZipEntries(blob) {
  const zip = await window.JSZip.loadAsync(blob);
  return Object.values(zip.files)
    .filter((f) => !f.dir)
    .map((f) => f.name);
}
