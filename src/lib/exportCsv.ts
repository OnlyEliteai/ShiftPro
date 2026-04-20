export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): Blob {
  const escape = (value: string | number | null | undefined) => {
    if (value == null) return '';
    const stringified = String(value);
    return /[",\n]/.test(stringified)
      ? `"${stringified.replace(/"/g, '""')}"`
      : stringified;
  };

  const body = [headers, ...rows]
    .map((row) => row.map((cell) => escape(cell)).join(','))
    .join('\n');

  return new Blob([`\ufeff${body}`], { type: 'text/csv;charset=utf-8;' });
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
