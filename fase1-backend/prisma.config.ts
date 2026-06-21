import 'dotenv/config'
import path from 'node:path'
import { defineConfig } from 'prisma/config' // Ensure the @ is there if using the official package

export default defineConfig({
  earlyAccess: true,
  schema: path.join('prisma', 'schema.prisma'),
  // This is what was missing:
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrate: {
    async adapter() {
      const { PrismaPg } = await import('@prisma/adapter-pg')
      // Note: You might need to import 'pg' and create a Pool here 
      // depending on your specific driver setup, but let's fix the URL error first.
      const { default: pg } = await import('pg')
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
      return new PrismaPg(pool)
    }
  }
})
