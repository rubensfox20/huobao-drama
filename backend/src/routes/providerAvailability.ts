import { Hono } from 'hono'
import { success } from '../utils/response.js'
import { getProviderAvailabilitySnapshot } from '../services/provider-availability.js'
import { toSnakeCase } from '../utils/transform.js'

const app = new Hono()

app.get('/:provider', async (c) => {
  const provider = c.req.param('provider')
  const snapshot = await getProviderAvailabilitySnapshot(provider)
  return success(c, {
    ...toSnakeCase(snapshot),
    services: snapshot.services.map(service => toSnakeCase(service)),
  })
})

export default app
