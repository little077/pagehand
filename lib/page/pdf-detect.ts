/** URL 只看 pathname，query/hash 不参与判断。只支持扩展能取到字节的协议。 */
export function isPdfUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) return false;
    return parsed.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

/** 服务器可能把 PDF 标成 octet-stream，空 Content-Type 也放过，最后再用魔数确认。 */
export function isPdfContentType(value: string | null | undefined): boolean {
  if (!value) return true;
  const type = value.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    !type ||
    type === 'application/pdf' ||
    type === 'application/x-pdf' ||
    type === 'application/octet-stream' ||
    type === 'binary/octet-stream'
  );
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

export function hasPdfMagic(bytes: Uint8Array | ArrayBuffer): boolean {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.length < PDF_MAGIC.length) return false;
  return PDF_MAGIC.every((value, index) => view[index] === value);
}

/** read_page / read_tab 命中 PDF 时给模型的可执行提示。 */
export function pdfRedirectMessage(tabId?: number): string {
  const tabPart = tabId === undefined ? '当前标签页' : `标签页 ${tabId}`;
  return (
    `${tabPart}是一个 PDF，正文不能用 DOM 方式读取。请改用 pdf 工具：` +
    'action="info" 看页数和目录；action="read" 读取正文，可传 page_range；' +
    'action="search" 搜索关键词。不要继续用 read_page 反复重试。'
  );
}
