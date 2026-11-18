import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

type PdfJsModule = typeof import('pdfjs-dist');

let modulePromise: Promise<PdfJsModule> | null = null;

/**
 * pdf.js 只在第一次处理 PDF 时加载；worker 用 ?url 单独产出，避免 API 和
 * worker 版本漂移。失败不缓存，下一次可以重试。
 */
export function loadPdfJs(): Promise<PdfJsModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })().catch((error) => {
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
}
