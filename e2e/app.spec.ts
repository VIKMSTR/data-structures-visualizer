import { expect, test, type Page } from '@playwright/test';

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
});

test.afterEach(() => {
  expect(errors, 'no console errors').toEqual([]);
});

const desc = (page: Page) => page.getByTestId('description');
const nodes = (page: Page) => page.locator('g.node:not(.cursor)');
/** Jump to the last step of the current animation (End key). */
const finish = (page: Page) => page.keyboard.press('End');

async function op(page: Page, value: string, name: 'Vložit' | 'Odstranit' | 'Najít', y?: string) {
  await page.getByTestId('value-input').fill(value);
  if (y !== undefined) await page.getByTestId('value-input-y').fill(y);
  await page.getByRole('button', { name, exact: true }).click();
}

async function preset(page: Page, name: string, animate = false) {
  await page.getByRole('button', { name: 'Vzory' }).click();
  const dlg = page.getByRole('dialog', { name: 'Vytvořit strukturu' });
  await dlg.getByRole('combobox').selectOption({ label: name });
  if (!animate) await dlg.getByRole('checkbox', { name: 'animovat' }).uncheck();
  await dlg.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(dlg).toBeHidden();
}

test('BVS: presets, insert, search, remove with successor swap, errors', async ({ page }, info) => {
  await page.goto('./#bst');
  await expect(page).toHaveTitle(/Binary Search tree/);
  await expect(nodes(page)).toHaveCount(0); // the original starts empty

  await preset(page, 'Sada 1');
  await expect(nodes(page)).toHaveCount(7);

  await op(page, '45', 'Vložit');
  await finish(page);
  await expect(nodes(page)).toHaveCount(8);
  await expect(desc(page)).toContainText('45 se stává pravým potomkem uzlu 40');

  await op(page, '99', 'Najít');
  await finish(page);
  await expect(page.locator('g.cursor')).toHaveAttribute('data-result', 'notfound');

  await op(page, '50', 'Odstranit');
  await finish(page);
  await expect(desc(page)).toContainText('vyměním ho s jeho in-order následníkem 80');
  await expect(nodes(page)).toHaveCount(7);

  await page.waitForTimeout(700);
  await page.screenshot({ path: `test-results/shots/bst-${info.project.name}.png` });

  await op(page, '45', 'Vložit');
  const dlg = page.getByRole('dialog', { name: 'Prvek nelze vložit' });
  await expect(dlg.getByTestId('error-message')).toHaveText('Tento prvek již ve struktuře existuje.');
  await dlg.getByRole('button', { name: 'OK', exact: true }).click();

  await op(page, 'abc', 'Odstranit');
  await expect(page.getByRole('dialog', { name: 'Prvek nelze odstranit' })).toContainText('není celým číslem');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('Krokovat: one step per >> / <<', async ({ page }) => {
  await page.goto('./#bst');
  await preset(page, 'Sada 1');
  await page.getByRole('checkbox', { name: 'Krokovat' }).check();
  await op(page, '45', 'Vložit');
  const lines = desc(page).locator('li');
  await expect(lines).toHaveCount(1);
  await page.waitForTimeout(400);
  await expect(lines).toHaveCount(1); // does not advance on its own
  await page.getByRole('button', { name: 'Další krok' }).click();
  await expect(lines).toHaveCount(2);
  await page.getByRole('button', { name: 'Další krok' }).click();
  await expect(lines).toHaveCount(3);
  await page.getByRole('button', { name: 'Předchozí krok' }).click();
  await expect(lines).toHaveCount(2);
});

test('AVL: RR case shows the rotation and rebalances', async ({ page }, info) => {
  await page.goto('./#avl');
  for (const v of ['10', '20', '30']) {
    await op(page, v, 'Vložit');
    await finish(page);
  }
  await expect(desc(page)).toContainText('Rotace doleva kolem uzlu 10.');
  await page.waitForTimeout(1200); // let the final 1 s move settle
  const ys = await nodes(page).evaluateAll((els) =>
    els.map((e) => ({ v: e.querySelector('text')!.textContent, y: (e as SVGGraphicsElement).getBoundingClientRect().top })),
  );
  ys.sort((a, b) => a.y - b.y);
  expect(ys[0].v).toBe('20');
  // The arrow is drawn during the rotation step.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('g.arrow')).toHaveCount(1);
  await finish(page);
  await preset(page, 'Sada 2');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `test-results/shots/avl-${info.project.name}.png` });
});

test('2-3 tree: preset, search highlights the key, remove merges', async ({ page }, info) => {
  await page.goto('./#tt');
  await expect(page).toHaveTitle(/2-3 strom/);
  await preset(page, 'Sada 3'); // [20,40]{[10],[30],[50]}
  await expect(page.locator('g.box')).toHaveCount(4);
  await expect(page.locator('text.key')).toHaveCount(5);

  await op(page, '30', 'Najít');
  await finish(page);
  await expect(desc(page)).toContainText('Klíč 30 byl NALEZEN.');
  await expect(page.locator('text.key.found')).toHaveText('30');

  await op(page, '10', 'Odstranit');
  await finish(page);
  await expect(desc(page)).toContainText('sloučím');
  await expect(page.locator('text.key')).toHaveCount(4);

  await op(page, '60', 'Vložit');
  await op(page, '70', 'Vložit');
  await finish(page);
  await expect(desc(page)).toContainText('Došlo k rozdělení prvku, klíč 60 je přesunut do rodiče');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `test-results/shots/tt-${info.project.name}.png` });
});

test('Quadtree: preset, tap to insert, two-field input, view switch', async ({ page, isMobile }, info) => {
  await page.goto('./#quad');
  await preset(page, 'Sada 1');
  if (isMobile) await page.getByTestId('view-switch').click(); // narrow screens show one view at a time
  await expect(page.locator('circle.point')).toHaveCount(4);

  const plane = page.getByTestId('quad-plane').getByRole('img');
  const box = (await plane.boundingBox())!;
  await plane.click({ position: { x: box.width * 0.62, y: box.height * 0.3 } });
  await finish(page);
  await expect(page.locator('circle.point')).toHaveCount(5);

  await op(page, '30', 'Najít', '70');
  await finish(page);
  await expect(desc(page)).toContainText('Bod [30.0,70.0] nalezen.');

  await op(page, '101', 'Vložit', '5');
  await expect(page.getByRole('dialog', { name: 'Prvek nelze vložit' })).toContainText('mimo rozsah (0-100)');
  await page.getByRole('button', { name: 'OK', exact: true }).click();

  await page.waitForTimeout(700);
  await page.screenshot({ path: `test-results/shots/quad-${info.project.name}.png` });
});

test('help dialog and language switch', async ({ page }) => {
  await page.goto('./#avl');
  await page.getByRole('button', { name: 'Nápověda' }).click();
  await expect(page.getByTestId('help-text')).toContainText('AVL (Adelson-Velskij, Landis) strom');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('tab', { name: 'AVL tree' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Insert' })).toBeVisible();
});

test('runs under the strict Content-Security-Policy used by the Tauri app', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  const res = await page.goto('./#bst');
  expect(res!.headers()['content-security-policy']).toContain("script-src 'self'");
  await page.getByRole('button', { name: 'Nápověda' }).click(); // {@html} help content
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await op(page, '5', 'Vložit');
  await finish(page);
  await expect(nodes(page)).toHaveCount(1);
  expect(violations).toEqual([]);
});
