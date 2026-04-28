import type { ExportWorkbookPayload } from './exportWorkbook';
import { createShiftWorkbookBuffer } from './exportWorkbook';

const workerScope = self as unknown as {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

self.addEventListener('message', (event: MessageEvent<ExportWorkbookPayload>) => {
  try {
    const buffer = createShiftWorkbookBuffer(event.data);
    workerScope.postMessage({ buffer }, [buffer]);
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : 'שגיאה ביצירת הקובץ',
    });
  }
});
