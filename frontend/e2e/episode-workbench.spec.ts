import { expect, test, type APIRequestContext } from '@playwright/test'

const adminHeaders = {
  Authorization: `Bearer ${process.env.NUXT_PUBLIC_ADMIN_TOKEN || process.env.HUOBAO_ADMIN_TOKEN || 'huobao-local-admin'}`,
}

async function createDramaFixture(request: APIRequestContext, title: string) {
  const response = await request.post('/api/v1/dramas', {
    headers: adminHeaders,
    data: {
      title,
      total_episodes: 1,
    },
  })
  const body = await response.text()
  expect(response.status(), body).toBe(201)
  const json = JSON.parse(body)
  return Number(json.data.id)
}

async function deleteDramaFixture(request: APIRequestContext, dramaId: number) {
  if (!Number.isFinite(dramaId)) return
  await request.delete(`/api/v1/dramas/${dramaId}`, {
    headers: adminHeaders,
  })
}

test('episode workbench exposes operational status widgets', async ({ page, request }) => {
  test.setTimeout(90_000)
  const dramaId = await createDramaFixture(request, `e2e-status-${Date.now()}`)

  try {
    await page.goto(`/drama/${dramaId}/episode/1`, { waitUntil: 'networkidle' })

    const statusHeading = page.getByRole('heading', { name: 'Saude da bancada do episodio' })
    await expect(statusHeading).toBeVisible({ timeout: 45000 })
    await statusHeading.scrollIntoViewIfNeeded()

    await expect(page.getByText('Modelos efetivos')).toBeVisible()
    await expect(page.getByText('Saude dos providers')).toBeVisible()
    await expect(page.getByText('Jobs recentes')).toBeVisible()
  } finally {
    await deleteDramaFixture(request, dramaId)
  }
})

test('episode topbar action gives feedback when the current step cannot advance', async ({ page, request }) => {
  const dramaId = await createDramaFixture(request, `e2e-topbar-${Date.now()}`)

  try {
    await page.goto(`/drama/${dramaId}/episode/1`, { waitUntil: 'networkidle' })

    await page.getByRole('banner').getByRole('button', { name: 'Conteudo bruto' }).click()

    const editor = page.locator('textarea.fill-textarea').first()
    await expect(editor).toBeVisible()
    await expect(editor).toBeInViewport()
    await expect(page.getByText('Preencha o conteudo bruto primeiro')).toBeVisible()
  } finally {
    await deleteDramaFixture(request, dramaId)
  }
})
