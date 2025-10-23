import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const sampleSearch = {
  results: [
    {
      id: 'lecture-1',
      entityType: 'lecture' as const,
      title: 'Intro to Peace Mode',
      subtitle: 'Automation · 12 min',
      badge: 'Lecture',
    },
  ],
};

const sampleTasks = {
  tasks: [
    { id: 'task-1', title: 'Transcribe Lecture A', status: 'running', progress: 42 },
    { id: 'task-2', title: 'Export Class C', status: 'queued', progress: 0 },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('lecture-tools-help-suppress', 'true');
    window.localStorage.setItem('lecture-tools-help-seen', 'true');
  });
  await page.route('**/api/search**', (route) => route.fulfill({ status: 200, body: JSON.stringify(sampleSearch) }));
  await page.route('**/api/progress**', (route) => route.fulfill({ status: 200, body: JSON.stringify(sampleTasks) }));
  await page.route('**/api/tasks/batch**', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ id: 'batch-1', accepted: 2, status: 'queued' }) }),
  );
  await page.route('**/api/storage/usage**', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ totalUsed: 128, entries: [] }),
    }),
  );
  await page.route('**/api/classes**', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ classes: [] }),
    }),
  );
  await page.route('**/api/catalog/bulk**', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ updated: 0 }) }),
  );
  await page.goto('/');
  const createReadyButton = page.getByRole('button', { name: 'Create', exact: true }).first();
  await expect(createReadyButton).toBeEnabled();
});

test('home surface passes axe audit', async ({ page }) => {
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test('create lecture flow surfaces inline editor within two taps', async ({ page }) => {
  const createButton = page.getByRole('button', { name: 'Create', exact: true }).first();
  await createButton.click();
  const timelineRegion = page.getByLabel('Status timeline');
  await expect(timelineRegion.getByText('Inline editor opened in Catalog.')).toBeVisible();
  await expect(page).toHaveURL(/catalog/);
});

test('upload and transcribe tiles are reachable in two taps', async ({ page }) => {
  const uploadRecording = page.getByRole('button', { name: 'Upload Recording' });
  await uploadRecording.click();
  await expect(page.getByText('Master and transcribe automatically.')).toBeVisible();
});

test('task cart guard rails respect long press for purge', async ({ page }) => {
  const purgeButton = page.locator('aside[aria-label="Quick actions"]').getByRole('button', { name: 'Purge' });
  await purgeButton.dispatchEvent('pointerdown');
  await page.waitForTimeout(900);
  await purgeButton.dispatchEvent('pointerup');
  const timelineRegion = page.getByLabel('Status timeline');
  await expect(timelineRegion.getByText('Bulk purge initiated')).toBeVisible();
});
