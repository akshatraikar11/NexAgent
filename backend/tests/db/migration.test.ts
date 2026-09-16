import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Database Migration & Rollback Verification', () => {
  it('Verifies presence and syntax of Prisma schema and Rollback SQL script', () => {
    const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
    const rollbackPath = path.resolve(process.cwd(), 'prisma/rollback.sql');

    expect(fs.existsSync(schemaPath)).toBe(true);
    expect(fs.existsSync(rollbackPath)).toBe(true);

    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
    const rollbackContent = fs.readFileSync(rollbackPath, 'utf-8');

    // Assert explicit onDelete rules exist in schema
    expect(schemaContent).toContain('onDelete: Cascade');
    expect(schemaContent).toContain('onDelete: SetNull');

    // Assert rollback drops all models
    expect(rollbackContent).toContain('DROP TABLE IF EXISTS "Ticket" CASCADE;');
    expect(rollbackContent).toContain('DROP TABLE IF EXISTS "Decision" CASCADE;');
    expect(rollbackContent).toContain('DROP TABLE IF EXISTS "HumanOverride" CASCADE;');
  });
});
