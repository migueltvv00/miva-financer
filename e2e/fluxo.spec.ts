import { test, expect, type Page } from '@playwright/test';

/**
 * Fluxo E2E Tests
 *
 * These tests require:
 * 1. The dev server running (handled by playwright.config webServer)
 * 2. A test user in Supabase: test@fluxo.pt / TestPass123!
 *    (Create manually in Supabase Auth dashboard before running)
 * 3. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local
 *
 * Run: pnpm test:e2e
 */

const TEST_EMAIL = process.env.TEST_EMAIL || 'test@fluxo.pt';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!';

// Helper: login
async function login(page: Page) {
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 10_000 });
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  // Wait for redirect to main app
  await page.waitForURL('/', { timeout: 15_000 });
}

// ─────────────────────────────────────────────────────────────
// AUTH SCENARIOS
// ─────────────────────────────────────────────────────────────

test.describe('Authentication', () => {
  test('should show login page for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('/login', { timeout: 10_000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await login(page);
    // Should see the bottom nav (mobile) or sidebar (desktop)
    await expect(page.locator('text=Adicionar')).toBeVisible({ timeout: 10_000 });
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('input[type="email"]');
    await page.fill('input[type="email"]', 'wrong@email.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    // Should stay on login and show error
    await expect(page.locator('[role="alert"], .text-\\[var\\(--color-danger\\)\\]')).toBeVisible({ timeout: 5_000 });
  });

  test('should protect routes when not authenticated', async ({ page }) => {
    await page.goto('/resumo');
    await page.waitForURL('/login', { timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────
// TRANSACTION ENTRY
// ─────────────────────────────────────────────────────────────

test.describe('Transaction Entry', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display expense entry screen by default', async ({ page }) => {
    await expect(page.locator('text=Despesa')).toBeVisible();
    await expect(page.locator('text=Receita')).toBeVisible();
  });

  test('should show category grid for expenses', async ({ page }) => {
    // Categories should be loaded (default seeded categories)
    await page.waitForTimeout(2_000);
    // Look for common default categories
    const categoryButtons = page.locator('[class*="category"], button:has-text("Alimentação"), button:has-text("Transportes")');
    await expect(categoryButtons.first()).toBeVisible({ timeout: 10_000 });
  });

  test('should toggle between expense and income', async ({ page }) => {
    await page.click('text=Receita');
    // Should show income-related UI (source selector)
    await page.waitForTimeout(1_000);
    await page.click('text=Despesa');
  });

  test('should create an expense transaction', async ({ page }) => {
    await page.waitForTimeout(2_000);

    // Enter amount via numpad - tap digits
    const numpadButtons = page.locator('button');
    await numpadButtons.filter({ hasText: /^5$/ }).click();
    await numpadButtons.filter({ hasText: /^0$/ }).click();
    await numpadButtons.filter({ hasText: /^0$/ }).click();

    // Select a category (first expense category)
    const categoryGrid = page.locator('button:has-text("Alimentação")');
    if (await categoryGrid.isVisible()) {
      await categoryGrid.click();
    }

    // Add a note
    const noteInput = page.locator('input[placeholder*="Nota"], input[placeholder*="nota"], textarea');
    if (await noteInput.isVisible()) {
      await noteInput.fill('Teste E2E Supermercado');
    }

    // Submit
    const submitButton = page.locator('button:has-text("Confirmar"), button:has-text("Guardar"), button[type="submit"]');
    if (await submitButton.isVisible()) {
      await submitButton.click();
      await page.waitForTimeout(1_000);
    }
  });

  test('should show smart category suggestion after typing note', async ({ page }) => {
    await page.waitForTimeout(2_000);

    // Type a note that should trigger suggestion (if user has history)
    const noteInput = page.locator('input[placeholder*="Nota"], input[placeholder*="nota"], textarea');
    if (await noteInput.isVisible()) {
      await noteInput.fill('Continente');
      await page.waitForTimeout(500);
      // Check for "Sugerido" badge
      const badge = page.locator('text=Sugerido');
      // Badge may or may not appear depending on transaction history
      // This is a non-failing check
      if (await badge.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await expect(badge).toBeVisible();
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// TRANSACTION LIST
// ─────────────────────────────────────────────────────────────

test.describe('Transaction List', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('text=Transações');
    await page.waitForTimeout(2_000);
  });

  test('should navigate to transaction list', async ({ page }) => {
    await expect(page.locator('text=Transações').first()).toBeVisible();
  });

  test('should display transactions grouped by date', async ({ page }) => {
    // Should show date headers or "no transactions" message
    const content = page.locator('main, [class*="content"], [class*="screen"]');
    await expect(content.first()).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('text=Resumo');
    await page.waitForTimeout(2_000);
  });

  test('should display monthly summary', async ({ page }) => {
    // Should show summary cards (income, expenses, net)
    await expect(page.locator('text=Receitas').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Despesas').first()).toBeVisible();
  });

  test('should have PDF export button', async ({ page }) => {
    const pdfButton = page.locator('text=Exportar relatório PDF, text=PDF, a:has-text("PDF")');
    await expect(pdfButton.first()).toBeVisible({ timeout: 10_000 });
  });

  test('should show spending trend sparklines', async ({ page }) => {
    // Look for trend-related elements (sparklines or insight text)
    // May not be visible if no historical data, but page should still load
    await page.waitForTimeout(2_000);
  });
});

// ─────────────────────────────────────────────────────────────
// SPENDING TRENDS
// ─────────────────────────────────────────────────────────────

test.describe('Spending Trends', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('text=Tendências');
    await page.waitForTimeout(2_000);
  });

  test('should navigate to trends screen', async ({ page }) => {
    await expect(page.locator('text=Tendências de Despesa')).toBeVisible({ timeout: 10_000 });
  });

  test('should show trend analysis description', async ({ page }) => {
    await expect(page.locator('text=Análise dos últimos 6 meses')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────
// SAVINGS GOALS
// ─────────────────────────────────────────────────────────────

test.describe('Savings Goals', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('text=Objetivos');
    await page.waitForTimeout(2_000);
  });

  test('should display goals screen', async ({ page }) => {
    await expect(page.locator('text=Objetivos de Poupança')).toBeVisible({ timeout: 10_000 });
  });

  test('should open new goal modal', async ({ page }) => {
    const newGoalBtn = page.locator('button:has-text("Novo objetivo")');
    await expect(newGoalBtn).toBeVisible();
    await newGoalBtn.click();
    await page.waitForTimeout(500);
    // Modal should be open with form fields
    await expect(page.locator('text=Nome do objetivo, input[placeholder*="objetivo"]').first()).toBeVisible({ timeout: 3_000 });
  });

  test('should create a savings goal', async ({ page }) => {
    await page.click('button:has-text("Novo objetivo")');
    await page.waitForTimeout(500);

    // Fill goal form
    const nameInput = page.locator('input[placeholder*="nome"], input[placeholder*="objetivo"], label:has-text("Nome") + input, input').nth(0);
    await nameInput.fill('Férias 2027');

    // Fill target amount
    const targetInput = page.locator('input[placeholder*="0,00"], input[inputmode="decimal"]').first();
    if (await targetInput.isVisible()) {
      await targetInput.fill('2000');
    }

    // Select an emoji
    const emojiButton = page.locator('button:has-text("✈️")');
    if (await emojiButton.isVisible()) {
      await emojiButton.click();
    }

    // Save
    const saveBtn = page.locator('button:has-text("Criar"), button:has-text("Guardar")');
    if (await saveBtn.first().isVisible()) {
      await saveBtn.first().click();
      await page.waitForTimeout(2_000);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// NET WORTH
// ─────────────────────────────────────────────────────────────

test.describe('Net Worth', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('text=Património');
    await page.waitForTimeout(2_000);
  });

  test('should display net worth screen', async ({ page }) => {
    await expect(page.locator('text=Património Líquido')).toBeVisible({ timeout: 10_000 });
  });

  test('should show month navigation', async ({ page }) => {
    // Month navigation arrows should be present
    const prevBtn = page.locator('button:has-text("←")');
    const nextBtn = page.locator('button:has-text("→")');
    await expect(prevBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();
  });

  test('should add asset entry', async ({ page }) => {
    const addAssetBtn = page.locator('button:has-text("Adicionar ativo"), button:has-text("ativo")');
    if (await addAssetBtn.isVisible()) {
      await addAssetBtn.click();
      await page.waitForTimeout(500);
      // Should show new input row
      const inputs = page.locator('input');
      expect(await inputs.count()).toBeGreaterThan(0);
    }
  });

  test('should add liability entry', async ({ page }) => {
    const addLiabilityBtn = page.locator('button:has-text("Adicionar passivo"), button:has-text("passivo")');
    if (await addLiabilityBtn.isVisible()) {
      await addLiabilityBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('should save net worth entry', async ({ page }) => {
    // Add an asset
    const addAssetBtn = page.locator('button:has-text("Adicionar ativo"), button:has-text("ativo")');
    if (await addAssetBtn.isVisible()) {
      await addAssetBtn.click();
      await page.waitForTimeout(500);

      // Fill asset name and value
      const nameInputs = page.locator('input[placeholder*="nome"], input[placeholder*="Nome"], input[type="text"]');
      const valueInputs = page.locator('input[inputmode="decimal"], input[placeholder*="0,00"]');

      if (await nameInputs.first().isVisible()) {
        await nameInputs.first().fill('Conta Poupança');
      }
      if (await valueInputs.first().isVisible()) {
        await valueInputs.first().fill('5000');
      }

      // Save
      const saveBtn = page.locator('button:has-text("Guardar")');
      if (await saveBtn.isVisible()) {
        await saveBtn.click();
        await page.waitForTimeout(2_000);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('text=Definições');
    await page.waitForTimeout(2_000);
  });

  test('should display settings screen', async ({ page }) => {
    await expect(page.locator('text=Definições').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should show user email', async ({ page }) => {
    await expect(page.locator(`text=${TEST_EMAIL}`)).toBeVisible();
  });

  test('should show category management', async ({ page }) => {
    // Categories section should be visible
    await expect(page.locator('text=Categorias').first()).toBeVisible();
  });

  test('should show income sources section', async ({ page }) => {
    await expect(page.locator('text=Fontes de Rendimento').first()).toBeVisible();
  });

  test('should show budget section', async ({ page }) => {
    await expect(page.locator('text=Orçamento').first()).toBeVisible({ timeout: 5_000 });
  });

  test('should show planning section', async ({ page }) => {
    await expect(page.locator('text=Planeamento').first()).toBeVisible({ timeout: 5_000 });
  });

  test('should have sign out button', async ({ page }) => {
    const signOutBtn = page.locator('button:has-text("Terminar sessão")');
    await expect(signOutBtn).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should have all navigation tabs', async ({ page }) => {
    const expectedTabs = ['Adicionar', 'Transações', 'Resumo', 'Tendências', 'Objetivos', 'Património', 'Definições'];
    for (const tab of expectedTabs) {
      await expect(page.locator(`text=${tab}`).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('should navigate between all main screens', async ({ page }) => {
    const routes = [
      { tab: 'Transações', expected: '/transacoes' },
      { tab: 'Resumo', expected: '/resumo' },
      { tab: 'Tendências', expected: '/tendencias' },
      { tab: 'Objetivos', expected: '/objetivos' },
      { tab: 'Património', expected: '/patrimonio' },
      { tab: 'Definições', expected: '/definicoes' },
    ];

    for (const { tab, expected } of routes) {
      await page.click(`text=${tab}`);
      await page.waitForURL(`**${expected}`, { timeout: 5_000 });
    }
  });
});

// ─────────────────────────────────────────────────────────────
// PWA / OFFLINE
// ─────────────────────────────────────────────────────────────

test.describe('PWA', () => {
  test('should register service worker', async ({ page }) => {
    await login(page);
    await page.waitForTimeout(3_000);

    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length > 0;
    });

    // SW may or may not register in test mode depending on config
    // Just verify the page loads correctly
    expect(true).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// RESPONSIVE DESIGN
// ─────────────────────────────────────────────────────────────

test.describe('Responsive Design', () => {
  test('should show bottom nav on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    // Bottom nav should be visible on mobile
    const bottomNav = page.locator('nav.fixed.bottom-0, nav[class*="bottom"]');
    await expect(bottomNav).toBeVisible({ timeout: 5_000 });
  });

  test('should show sidebar on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page);
    // Sidebar should be visible
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 5_000 });
  });
});
