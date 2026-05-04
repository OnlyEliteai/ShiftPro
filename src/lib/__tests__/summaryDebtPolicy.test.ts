import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readProjectFile(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('summary debt policy', () => {
  it('does not block chatters from clocking into shifts because of missing summaries', () => {
    const clockInFunction = readProjectFile('supabase/functions/clock-in/index.ts');

    expect(clockInFunction).not.toContain('SUMMARY_DEBT');
  });

  it('does not disable chatter clock-in actions because of summary debt', () => {
    const chatterPage = readProjectFile('src/pages/ChatterPage.tsx');

    expect(chatterPage).not.toContain('summaryDebtBanner');
    expect(chatterPage).not.toContain('Boolean(debtShift)');
    expect(chatterPage).not.toContain("summaryModalSource === 'debt'");
  });
});
