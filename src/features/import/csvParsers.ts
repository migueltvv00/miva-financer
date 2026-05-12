import Papa from 'papaparse';

export interface ParsedTransaction {
  date: string;
  description: string;
  amount_cents: number;
  type: 'expense' | 'income';
}

export type BankId = 'cgd' | 'bpi' | 'millennium' | 'novo_banco';

export const BANK_LABELS: Record<BankId, string> = {
  cgd: 'Caixa Geral de Depósitos',
  bpi: 'BPI',
  millennium: 'Millennium BCP',
  novo_banco: 'Novo Banco',
};

type CsvRow = Record<string, string>;

interface SignedAmount {
  amountCents: number;
  type: ParsedTransaction['type'];
}

function parsePortugueseNumber(value: string): number {
  const cleaned = value.trim().replace(/\./g, '').replace(',', '.');
  return Math.round(Math.abs(Number.parseFloat(cleaned)) * 100);
}

function parseSignedAmount(value: string): SignedAmount | null {
  const cleaned = value.trim().replace(/\./g, '').replace(',', '.');
  const parsedValue = Number.parseFloat(cleaned);

  if (!Number.isFinite(parsedValue) || parsedValue === 0) {
    return null;
  }

  return {
    amountCents: parsePortugueseNumber(value),
    type: parsedValue < 0 ? 'expense' : 'income',
  };
}

function parseDate(value: string, separator: '-' | '/'): string {
  const [day, month, year] = value.trim().split(separator);

  if (!day || !month || !year) {
    throw new Error('Foi encontrada uma data inválida no ficheiro CSV.');
  }

  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function getRowValue(row: CsvRow, field: string): string {
  return row[field] ?? row[`\uFEFF${field}`] ?? '';
}

function ensureHeaders(
  availableHeaders: string[] | undefined,
  requiredHeaders: string[]
) {
  const normalizedHeaders = new Set(
    (availableHeaders ?? []).map((header) => header.replace(/^\uFEFF/, ''))
  );

  const hasAllHeaders = requiredHeaders.every((header) => normalizedHeaders.has(header));

  if (!hasAllHeaders) {
    throw new Error('O ficheiro CSV não corresponde ao banco selecionado.');
  }
}

function mapSignedAmountRow(
  row: CsvRow,
  options: {
    dateField: string;
    descriptionField: string;
    amountField: string;
    dateSeparator: '-' | '/';
  }
): ParsedTransaction | null {
  const amount = parseSignedAmount(getRowValue(row, options.amountField));
  const description = getRowValue(row, options.descriptionField).trim();
  const dateValue = getRowValue(row, options.dateField).trim();

  if (!amount || !description || !dateValue) {
    return null;
  }

  return {
    date: parseDate(dateValue, options.dateSeparator),
    description,
    amount_cents: amount.amountCents,
    type: amount.type,
  };
}

function mapMillenniumRow(row: CsvRow): ParsedTransaction | null {
  const description = getRowValue(row, 'Descrição').trim();
  const dateValue = getRowValue(row, 'Data').trim();
  const debitValue = getRowValue(row, 'Débito').trim();
  const creditValue = getRowValue(row, 'Crédito').trim();

  if (!description || !dateValue) {
    return null;
  }

  if (debitValue) {
    const amountCents = parsePortugueseNumber(debitValue);

    if (amountCents > 0) {
      return {
        date: parseDate(dateValue, '-'),
        description,
        amount_cents: amountCents,
        type: 'expense',
      };
    }
  }

  if (creditValue) {
    const amountCents = parsePortugueseNumber(creditValue);

    if (amountCents > 0) {
      return {
        date: parseDate(dateValue, '-'),
        description,
        amount_cents: amountCents,
        type: 'income',
      };
    }
  }

  return null;
}

export function parseCSV(bank: BankId, csvText: string): ParsedTransaction[] {
  const result = Papa.parse<CsvRow>(csvText, {
    delimiter: ';',
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    throw new Error(result.errors[0]?.message ?? 'Não foi possível analisar o ficheiro CSV.');
  }

  switch (bank) {
    case 'cgd':
      ensureHeaders(result.meta.fields, ['Data', 'Descrição', 'Valor']);
      return result.data.flatMap((row) => {
        const transaction = mapSignedAmountRow(row, {
          dateField: 'Data',
          descriptionField: 'Descrição',
          amountField: 'Valor',
          dateSeparator: '-',
        });

        return transaction ? [transaction] : [];
      });
    case 'bpi':
      ensureHeaders(result.meta.fields, ['Data Mov.', 'Descrição', 'Valor']);
      return result.data.flatMap((row) => {
        const transaction = mapSignedAmountRow(row, {
          dateField: 'Data Mov.',
          descriptionField: 'Descrição',
          amountField: 'Valor',
          dateSeparator: '/',
        });

        return transaction ? [transaction] : [];
      });
    case 'millennium':
      ensureHeaders(result.meta.fields, ['Data', 'Descrição', 'Débito', 'Crédito']);
      return result.data.flatMap((row) => {
        const transaction = mapMillenniumRow(row);
        return transaction ? [transaction] : [];
      });
    case 'novo_banco':
      ensureHeaders(result.meta.fields, ['Data', 'Descrição', 'Montante']);
      return result.data.flatMap((row) => {
        const transaction = mapSignedAmountRow(row, {
          dateField: 'Data',
          descriptionField: 'Descrição',
          amountField: 'Montante',
          dateSeparator: '/',
        });

        return transaction ? [transaction] : [];
      });
    default:
      return [];
  }
}
