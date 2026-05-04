import { expect, test } from '@playwright/test'

test('settings exposes prompts, observability and ideas tabs', async ({ page }) => {
  await page.goto('/settings')

  await expect(page.getByRole('button', { name: 'Prompts' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Saude e jobs' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ideias' })).toBeVisible()

  await page.getByRole('button', { name: 'Prompts' }).click()
  await expect(page.getByRole('heading', { name: 'Studio de prompts' })).toBeVisible()

  await page.getByRole('button', { name: 'Saude e jobs' }).click()
  await expect(page.getByRole('heading', { name: 'Saude do sistema e jobs' })).toBeVisible()

  await page.getByRole('button', { name: 'Ideias' }).click()
  await expect(page.getByRole('heading', { name: 'Ideias e discovery' })).toBeVisible()
})
