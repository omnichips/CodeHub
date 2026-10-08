import { expect, test, type Page } from '@playwright/test';

const tab = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function newTrip(page: Page, members: string[], name = 'Cebu') {
  await page.goto('/');
  await expect(page.getByText('No trips yet')).toBeVisible();
  await page.getByLabel('Trip name').fill(name);
  await page.getByRole('button', { name: 'Create trip' }).click();
  await expect(page.getByText('No expenses yet')).toBeVisible();
  await tab(page, 'Members').click();
  for (const m of members) {
    await page.getByLabel('Member name').fill(m);
    await page.getByRole('button', { name: 'Add member' }).click();
    await expect(page.getByLabel(`Name of ${m}`)).toBeVisible();
  }
  await tab(page, 'Expenses').click();
}

async function openExpense(page: Page, title: string, amount: string) {
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Amount').fill(amount);
}

const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true }).click();

test('Workflow A: trip, members, expense, balances, settle up', async ({ page }) => {
  await newTrip(page, ['Ana', 'Ben', 'Cy']);
  await openExpense(page, 'Dinner', '300');
  await save(page);
  await expect(page.getByRole('button', { name: /Dinner/ })).toContainText('PHP 300.00');

  await tab(page, 'Settle up').click();
  await expect(page.getByText('+PHP 200.00', { exact: true })).toBeVisible();
  await expect(page.getByText('−PHP 100.00', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Ben pays Ana PHP 100.00')).toBeVisible();
  await expect(page.getByText('Cy pays Ana PHP 100.00')).toBeVisible();

  await page.getByRole('button', { name: 'Mark as paid' }).first().click();
  await page.getByRole('button', { name: 'Mark as paid' }).first().click();
  await expect(page.getByText('All settled')).toBeVisible();
  await expect(page.getByText('PHP 0.00', { exact: true })).toHaveCount(3);
});

test('shares, percent and exact splits', async ({ page }) => {
  await newTrip(page, ['Ana', 'Ben']);

  await openExpense(page, 'Shares', '100');
  await page.getByRole('button', { name: 'Shares' }).click();
  await page.getByLabel('Ben shares').fill('3'); // Ana 1, Ben 3 -> 25 / 75
  await save(page);

  await openExpense(page, 'Percent', '100');
  await page.getByRole('button', { name: 'Percent' }).click();
  await page.getByLabel('Ana percent').fill('30');
  await page.getByLabel('Ben percent').fill('60');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.getByText('Remaining: 10.00%')).toBeVisible();
  await page.getByLabel('Ben percent').fill('70'); // 30 / 70
  await expect(page.getByText('Remaining: 0.00%')).toBeVisible();
  await save(page);

  await openExpense(page, 'Exact', '100');
  await page.getByRole('button', { name: 'Exact' }).click();
  await page.getByLabel('Ana exact').fill('20');
  await page.getByLabel('Ben exact').fill('50');
  await expect(page.getByText('Remaining: PHP 30.00')).toBeVisible();
  await page.getByLabel('Ben exact').fill('80'); // 20 / 80
  await save(page);

  // Ana paid all three: owed 25+30+20 = 75 of 300 -> +225; Ben owes 75+70+80.
  await tab(page, 'Settle up').click();
  await expect(page.getByText('+PHP 225.00', { exact: true })).toBeVisible();
  await expect(page.getByText('−PHP 225.00', { exact: true })).toBeVisible();
  await expect(page.getByText('Ben pays Ana PHP 225.00')).toBeVisible();
});

test('foreign-currency expense uses the typed rate', async ({ page }) => {
  await newTrip(page, ['Ana', 'Ben']);
  await openExpense(page, 'Museum', '10.00');
  await page.getByLabel('Currency').selectOption('EUR');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled(); // rate missing
  await page.getByLabel('Rate').fill('65.20');
  await save(page);
  await expect(page.getByRole('button', { name: /Museum/ })).toContainText('PHP 652.00');
  await expect(page.getByRole('button', { name: /Museum/ })).toContainText('EUR 10.00');

  // A second EUR expense pre-fills the last rate.
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Currency').selectOption('EUR');
  await expect(page.getByLabel('Rate')).toHaveValue('65.20');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await tab(page, 'Settle up').click();
  await expect(page.getByText('+PHP 326.00', { exact: true })).toBeVisible();
});

test('members with expenses become inactive; tap targets are 48px', async ({ page }) => {
  await newTrip(page, ['Ana', 'Ben']);
  await openExpense(page, 'Taxi', '50');
  await save(page);

  for (const name of ['Expenses', 'Settle up', 'Members']) {
    expect((await tab(page, name).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
  await expect(page.getByRole('button', { name: 'Add expense' })).toBeVisible();
  expect((await page.getByRole('button', { name: 'Add expense' }).boundingBox())!.height).toBeGreaterThanOrEqual(48);

  await tab(page, 'Members').click();
  await page.getByRole('button', { name: 'Remove Ben' }).click();
  await expect(page.getByRole('button', { name: 'Reactivate Ben' })).toBeVisible();
});

test('split by item, with service charge spread by what each person had', async ({ page }) => {
  await newTrip(page, ['Ana', 'Ben', 'Cy']);
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Title').fill('Dinner');
  await page.getByRole('button', { name: 'Items', exact: true }).click();

  // Pasta 300 (Ana), Pizza 600 (Ben, Cy), Wine 300 (everyone); bill 1320 with 10% service.
  const item = async (n: number, name: string, price: string, without: string[]) => {
    if (n > 1) await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByLabel(`Item ${n} name`).fill(name);
    await page.getByLabel(`Item ${n} price`).fill(price);
    const who = page.getByRole('group', { name: `Who shared item ${n}` });
    for (const m of without) await who.getByRole('button', { name: m, exact: true }).click();
  };
  await item(1, 'Pasta', '300', ['Ben', 'Cy']);
  await item(2, 'Pizza', '600', ['Ana']);
  await item(3, 'Wine', '300', []);

  await page.getByRole('button', { name: 'Use items total: PHP 1200.00' }).click();
  await expect(page.getByLabel('Amount')).toHaveValue('1200.00');
  await page.getByLabel('Amount').fill('1320');
  await expect(page.getByText('tax, tip and service PHP 120.00')).toBeVisible();
  await page.screenshot({ path: 'test-results/items-sheet.png', fullPage: true });
  await save(page);
  await expect(page.getByRole('button', { name: /Dinner/ })).toContainText('PHP 1320.00');

  await tab(page, 'Settle up').click();
  await expect(page.getByText('+PHP 880.00', { exact: true })).toBeVisible(); // Ana paid 1320, owes 440
  await expect(page.getByText('−PHP 440.00', { exact: true })).toHaveCount(2);

  // Editing keeps the items.
  await tab(page, 'Expenses').click();
  await page.getByRole('button', { name: /Dinner/ }).click();
  await expect(page.getByLabel('Item 2 name')).toHaveValue('Pizza');
  await expect(page.getByRole('group', { name: 'Who shared item 2' }).getByRole('button', { name: 'Ana', exact: true })).toHaveAttribute('aria-pressed', 'false');
});
