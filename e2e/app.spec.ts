import { expect, test, type Page } from '@playwright/test';

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => localStorage.setItem('dsviz.lang', 'en'));
});

test.afterEach(() => {
  expect(errors, 'no console errors').toEqual([]);
});

const message = (page: Page) => page.getByTestId('step-message');
const lastStep = (page: Page) => page.getByRole('button', { name: 'Last step' }).click();

async function runOp(page: Page, value: string, op: string) {
  await page.getByTestId('value-input').fill(value);
  await page.getByRole('button', { name: op, exact: true }).click();
}

test('BST: demo tree, insert, search, remove, step back', async ({ page }, info) => {
  await page.goto('./#bst');
  await expect(page.locator('.node')).toHaveCount(7);

  await runOp(page, '45', 'Insert');
  await expect(page.getByTestId('play')).toHaveAttribute('aria-label', 'Pause'); // autoplays
  await lastStep(page);
  await expect(message(page)).toContainText('45 becomes the right child of 40');
  await expect(page.locator('.node')).toHaveCount(8);

  await page.getByRole('button', { name: 'Previous step' }).click();
  await expect(page.getByTestId('step-counter')).toHaveText(/Step 3 of 4/);

  await runOp(page, '99', 'Search');
  await lastStep(page);
  await expect(message(page)).toContainText('99 is not in the tree');

  await runOp(page, '50', 'Remove');
  await lastStep(page);
  await expect(message(page)).toContainText('45 took the place of 50');
  await expect(page.locator('.node')).toHaveCount(7);

  await page.waitForTimeout(800); // let the tween settle
  await page.screenshot({ path: `test-results/shots/bst-${info.project.name}.png` });
});

test('BST: invalid input shows an error', async ({ page }) => {
  await page.goto('./#bst');
  await runOp(page, 'abc', 'Insert');
  await expect(page.getByRole('alert')).toContainText('whole numbers');
});

test('AVL: RR case triggers a left rotation', async ({ page }, info) => {
  await page.goto('./#avl');
  await page.getByRole('button', { name: 'Clear' }).click();
  await runOp(page, '10, 20, 30', 'Insert');
  await lastStep(page);
  await expect(page.locator('ol')).toContainText('Rotate left around 10.');
  await expect(message(page)).toContainText('whole tree is balanced');
  // After the rotation the root (topmost node) is 20.
  const ys = await page.locator('.node').evaluateAll((els) =>
    els.map((e) => ({ v: e.querySelector('text')!.textContent, y: (e as SVGGraphicsElement).getBoundingClientRect().top })),
  );
  ys.sort((a, b) => a.y - b.y);
  expect(ys[0].v).toBe('20');
  await expect(page.locator('.bal')).toHaveCount(3);
  await page.waitForTimeout(800); // let the tween settle
  await page.screenshot({ path: `test-results/shots/avl-${info.project.name}.png` });
});

test('Quadtree: tap into the plane inserts a point', async ({ page }, info) => {
  await page.goto('./#quad');
  await expect(page.locator('.point')).toHaveCount(6);
  const plane = page.getByTestId('quad-plane').getByRole('img');
  const box = (await plane.boundingBox())!;
  // Tap slightly left/below the center: the (empty) SW quadrant near the middle.
  await plane.click({ position: { x: box.width * 0.42, y: box.height * 0.6 } });
  await lastStep(page);
  await expect(page.locator('.point')).toHaveCount(7);
  await expect(page.getByTestId('value-input')).toHaveValue(/^\d+, \d+$/);
  await page.waitForTimeout(800); // let the tween settle
  await page.screenshot({ path: `test-results/shots/quad-${info.project.name}.png` });
});

test('Quadtree: insert splits, remove merges', async ({ page }) => {
  await page.goto('./#quad');
  await page.getByRole('button', { name: 'Clear' }).click();
  await runOp(page, '10 10; 11 11', 'Insert');
  await lastStep(page);
  await expect(page.locator('ol')).toContainText('Split into four quadrants');
  await runOp(page, '11, 11', 'Remove');
  await lastStep(page);
  await expect(page.locator('ol')).toContainText('merge them back');
  await expect(page.locator('.point')).toHaveCount(1);
});

test('keyboard playback and language switch', async ({ page, isMobile }) => {
  test.skip(isMobile, 'no hardware keyboard');
  await page.goto('./#bst');
  await runOp(page, '65', 'Insert');
  await page.locator('body').click({ position: { x: 5, y: 5 } }); // move focus out of the input
  await page.keyboard.press('Home');
  await expect(page.getByTestId('step-counter')).toHaveText(/Step 1 of/);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('step-counter')).toHaveText(/Step 2 of/);

  await page.getByRole('button', { name: 'Čeština' }).click();
  await expect(page.locator('h1')).toHaveText('Vizualizace datových struktur');
  await expect(page.getByRole('tab', { name: 'AVL strom' })).toBeVisible();
  await expect(page).toHaveTitle('Vizualizace datových struktur');
});
