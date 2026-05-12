import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface MonthlyReportProps {
  month: string;
  userEmail: string;
  generatedAt: Date;
  totalIncomeCents: number;
  totalExpenseCents: number;
  incomeBySource: Array<{ name: string; amountCents: number }>;
  expenseByCategory: Array<{
    name: string;
    budgetedCents: number | null;
    actualCents: number;
  }>;
  freelanceYtdCents: number;
  savingsGoals: Array<{
    name: string;
    currentCents: number;
    targetCents: number;
  }>;
}

const styles = StyleSheet.create({
  coverPage: {
    paddingTop: 72,
    paddingHorizontal: 48,
    paddingBottom: 48,
    backgroundColor: '#FFFFFF',
    color: '#111111',
  },
  contentPage: {
    paddingTop: 48,
    paddingHorizontal: 40,
    paddingBottom: 56,
    backgroundColor: '#FFFFFF',
    color: '#111111',
    fontSize: 11,
  },
  coverTitle: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 16,
  },
  coverSubtitle: {
    fontSize: 18,
    marginBottom: 28,
  },
  coverMeta: {
    fontSize: 11,
    color: '#4B5563',
    marginBottom: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.5,
    color: '#374151',
  },
  metricsTable: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    overflow: 'hidden',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  metricRowLast: {
    borderBottomWidth: 0,
  },
  metricLabel: {
    fontSize: 11,
    color: '#374151',
  },
  metricValue: {
    fontSize: 11,
    fontWeight: 700,
  },
  table: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 1,
    borderBottomColor: '#D1D5DB',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableRowTotal: {
    backgroundColor: '#F9FAFB',
  },
  headerText: {
    fontSize: 10,
    fontWeight: 700,
    color: '#111111',
  },
  cellText: {
    fontSize: 10,
    color: '#111111',
  },
  totalText: {
    fontWeight: 700,
  },
  nameCellWide: {
    width: '70%',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  amountCellNarrow: {
    width: '30%',
    paddingVertical: 8,
    paddingHorizontal: 10,
    textAlign: 'right',
  },
  nameCell: {
    width: '40%',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  amountCell: {
    width: '20%',
    paddingVertical: 8,
    paddingHorizontal: 10,
    textAlign: 'right',
  },
  goalsCard: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  goalName: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 4,
  },
  goalMeta: {
    fontSize: 10,
    color: '#374151',
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 20,
    fontSize: 9,
    color: '#6B7280',
    textAlign: 'center',
  },
});

function capitalize(value: string) {
  return value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function getMonthDate(month: string) {
  const [year = Number.NaN, monthIndex = Number.NaN] = month
    .split('-')
    .map((value) => Number.parseInt(value, 10));

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    return new Date();
  }

  return new Date(year, monthIndex - 1, 1);
}

function formatMonthLabel(month: string) {
  return capitalize(
    new Intl.DateTimeFormat('pt-PT', {
      month: 'long',
      year: 'numeric',
    }).format(getMonthDate(month))
  );
}

function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat('pt-PT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatCentsForPdf(cents: number): string {
  const euros = cents / 100;
  return (
    euros.toLocaleString('pt-PT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' €'
  );
}

function formatSavingsRate(totalIncomeCents: number, totalExpenseCents: number) {
  if (totalIncomeCents <= 0) {
    return 'N/A';
  }

  return `${(((totalIncomeCents - totalExpenseCents) / totalIncomeCents) * 100).toFixed(1)}%`;
}

function formatGoalProgress(currentCents: number, targetCents: number) {
  if (targetCents <= 0) {
    return '0,0%';
  }

  return `${Math.min((currentCents / targetCents) * 100, 100).toFixed(1).replace('.', ',')}%`;
}

export function MonthlyReport({
  month,
  userEmail,
  generatedAt,
  totalIncomeCents,
  totalExpenseCents,
  incomeBySource,
  expenseByCategory,
  freelanceYtdCents,
  savingsGoals,
}: MonthlyReportProps) {
  const monthLabel = formatMonthLabel(month);
  const netCents = totalIncomeCents - totalExpenseCents;
  const hasExpenseBudgets = expenseByCategory.some(
    (item) => typeof item.budgetedCents === 'number'
  );
  const totalBudgetedCents = expenseByCategory.reduce(
    (sum, item) => sum + (item.budgetedCents ?? 0),
    0
  );

  return (
    <Document>
      <Page size="A4" style={styles.coverPage}>
        <Text style={styles.coverTitle}>Relatório Mensal</Text>
        <Text style={styles.coverSubtitle}>{monthLabel}</Text>
        <Text style={styles.coverMeta}>{userEmail}</Text>
        <Text style={styles.coverMeta}>Gerado em: {formatLongDate(generatedAt)}</Text>
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>

      <Page size="A4" style={styles.contentPage} wrap>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumo</Text>
          <View style={styles.metricsTable}>
            {[
              ['Receitas totais', formatCentsForPdf(totalIncomeCents)],
              ['Despesas totais', formatCentsForPdf(totalExpenseCents)],
              ['Saldo líquido', formatCentsForPdf(netCents)],
              ['Taxa de poupança', formatSavingsRate(totalIncomeCents, totalExpenseCents)],
            ].map(([label, value], index, rows) => (
              <View
                key={label}
                style={index === rows.length - 1 ? [styles.metricRow, styles.metricRowLast] : styles.metricRow}
              >
                <Text style={styles.metricLabel}>{label}</Text>
                <Text style={styles.metricValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalhe de receitas</Text>
          {incomeBySource.length === 0 ? (
            <Text style={styles.paragraph}>Sem receitas registadas no mês selecionado.</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.nameCellWide, styles.headerText]}>Fonte</Text>
                <Text style={[styles.amountCellNarrow, styles.headerText]}>Montante</Text>
              </View>
              {incomeBySource.map((item, index) => (
                <View
                  key={`${item.name}-${index}`}
                  style={
                    index === incomeBySource.length - 1
                      ? [styles.tableRow, styles.tableRowLast]
                      : styles.tableRow
                  }
                >
                  <Text style={[styles.nameCellWide, styles.cellText]}>{item.name}</Text>
                  <Text style={[styles.amountCellNarrow, styles.cellText]}>
                    {formatCentsForPdf(item.amountCents)}
                  </Text>
                </View>
              ))}
              <View style={[styles.tableRow, styles.tableRowTotal, styles.tableRowLast]}>
                <Text style={[styles.nameCellWide, styles.cellText, styles.totalText]}>Total</Text>
                <Text style={[styles.amountCellNarrow, styles.cellText, styles.totalText]}>
                  {formatCentsForPdf(totalIncomeCents)}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalhe de despesas</Text>
          {expenseByCategory.length === 0 ? (
            <Text style={styles.paragraph}>Sem despesas ou orçamentos para apresentar.</Text>
          ) : hasExpenseBudgets ? (
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.nameCell, styles.headerText]}>Categoria</Text>
                <Text style={[styles.amountCell, styles.headerText]}>Orçamentado</Text>
                <Text style={[styles.amountCell, styles.headerText]}>Real</Text>
                <Text style={[styles.amountCell, styles.headerText]}>Desvio</Text>
              </View>
              {expenseByCategory.map((item, index) => {
                const varianceCents =
                  typeof item.budgetedCents === 'number'
                    ? item.budgetedCents - item.actualCents
                    : null;

                return (
                  <View
                    key={`${item.name}-${index}`}
                    style={
                      index === expenseByCategory.length - 1
                        ? [styles.tableRow, styles.tableRowLast]
                        : styles.tableRow
                    }
                  >
                    <Text style={[styles.nameCell, styles.cellText]}>{item.name}</Text>
                    <Text style={[styles.amountCell, styles.cellText]}>
                      {typeof item.budgetedCents === 'number'
                        ? formatCentsForPdf(item.budgetedCents)
                        : '—'}
                    </Text>
                    <Text style={[styles.amountCell, styles.cellText]}>
                      {formatCentsForPdf(item.actualCents)}
                    </Text>
                    <Text style={[styles.amountCell, styles.cellText]}>
                      {varianceCents === null ? '—' : formatCentsForPdf(varianceCents)}
                    </Text>
                  </View>
                );
              })}
              <View style={[styles.tableRow, styles.tableRowTotal, styles.tableRowLast]}>
                <Text style={[styles.nameCell, styles.cellText, styles.totalText]}>Total</Text>
                <Text style={[styles.amountCell, styles.cellText, styles.totalText]}>
                  {formatCentsForPdf(totalBudgetedCents)}
                </Text>
                <Text style={[styles.amountCell, styles.cellText, styles.totalText]}>
                  {formatCentsForPdf(totalExpenseCents)}
                </Text>
                <Text style={[styles.amountCell, styles.cellText, styles.totalText]}>
                  {formatCentsForPdf(totalBudgetedCents - totalExpenseCents)}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.nameCellWide, styles.headerText]}>Categoria</Text>
                <Text style={[styles.amountCellNarrow, styles.headerText]}>Real</Text>
              </View>
              {expenseByCategory.map((item, index) => (
                <View
                  key={`${item.name}-${index}`}
                  style={
                    index === expenseByCategory.length - 1
                      ? [styles.tableRow, styles.tableRowLast]
                      : styles.tableRow
                  }
                >
                  <Text style={[styles.nameCellWide, styles.cellText]}>{item.name}</Text>
                  <Text style={[styles.amountCellNarrow, styles.cellText]}>
                    {formatCentsForPdf(item.actualCents)}
                  </Text>
                </View>
              ))}
              <View style={[styles.tableRow, styles.tableRowTotal, styles.tableRowLast]}>
                <Text style={[styles.nameCellWide, styles.cellText, styles.totalText]}>Total</Text>
                <Text style={[styles.amountCellNarrow, styles.cellText, styles.totalText]}>
                  {formatCentsForPdf(totalExpenseCents)}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>IRS — Trabalho independente</Text>
          <View style={styles.metricsTable}>
            <View style={[styles.metricRow, styles.metricRowLast]}>
              <Text style={styles.metricLabel}>Rendimento freelance YTD</Text>
              <Text style={styles.metricValue}>{formatCentsForPdf(freelanceYtdCents)}</Text>
            </View>
          </View>
          <Text style={[styles.paragraph, { marginTop: 8 }]}>
            Nota: Os valores de rendimento de trabalho independente (Categoria B) são
            apresentados para referência. Consulte um contabilista certificado para
            apuramento fiscal. Este relatório não substitui a declaração de IRS.
          </Text>
        </View>

        {savingsGoals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Objetivos de poupança</Text>
            {savingsGoals.map((goal, index) => (
              <View key={`${goal.name}-${index}`} style={styles.goalsCard}>
                <Text style={styles.goalName}>{goal.name}</Text>
                <Text style={styles.goalMeta}>
                  {formatCentsForPdf(goal.currentCents)} / {formatCentsForPdf(goal.targetCents)}
                </Text>
                <Text style={styles.goalMeta}>
                  Progresso: {formatGoalProgress(goal.currentCents, goal.targetCents)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}
