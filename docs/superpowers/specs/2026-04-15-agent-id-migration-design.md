# Agent ID Migration: Slug to UUID Primary Key

## Context

The `agents` table currently uses `slug` (TEXT) as its primary key. Five child tables reference `agents(slug)` as a foreign key: `jamaah`, `jamaah_haji`, `flight_shares`, `ai_credits`, `capi_configs`, and `analytics_events`. This makes it impossible to change an agent's slug without cascading failures or destructive workarounds (the current profile update endpoint deletes and re-inserts jamaah data).

**Goal:** Add a UUID `id` column as the new primary key for `agents`, migrate all foreign keys to reference `id` instead of `slug`, and make `slug` a mutable unique field. This enables agents to change their slug dynamically without breaking data relationships.

**Additional requirement:** Old slugs should redirect to the new slug for public-facing URLs.

---

## Database Schema Changes

### 1. Alter `agents` table

```sql
-- Add id column
ALTER TABLE agents ADD COLUMN id UUID DEFAULT gen_random_uuid() NOT NULL;

-- Populate id for existing rows (already done by DEFAULT, but ensure)
UPDATE agents SET id = gen_random_uuid() WHERE id IS NULL;

-- Add unique constraint on id (before PK swap)
ALTER TABLE agents ADD CONSTRAINT agents_id_unique UNIQUE (id);
```

> PK swap (from `slug` to `id`) happens AFTER all child FK migrations, since child tables currently reference `agents(slug)`.

### 2. New table: `agent_slug_history`

```sql
CREATE TABLE agent_slug_history (
  id SERIAL PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  old_slug TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_slug_history_old_slug ON agent_slug_history(old_slug);
```

### 3. Migrate child tables

For each child table, the pattern is:

1. Add `agent_id UUID` column
2. Populate via join to `agents`
3. Add NOT NULL constraint
4. Add new FK, indexes, and unique constraints
5. Drop old FK, indexes, and unique constraints on `agent_slug`
6. Drop `agent_slug` column

#### jamaah

```sql
ALTER TABLE jamaah ADD COLUMN agent_id UUID;
UPDATE jamaah SET agent_id = agents.id FROM agents WHERE jamaah.agent_slug = agents.slug;
ALTER TABLE jamaah ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE jamaah ADD CONSTRAINT jamaah_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id);

-- New unique constraint & indexes
ALTER TABLE jamaah ADD CONSTRAINT jamaah_agent_id_id_umroh_nama_key UNIQUE (agent_id, id_umroh, nama);
CREATE INDEX idx_jamaah_agent_id ON jamaah(agent_id);
CREATE INDEX idx_jamaah_agent_id_hijriah ON jamaah(agent_id, hijriah_year);

-- Drop old constraints & column
ALTER TABLE jamaah DROP CONSTRAINT jamaah_agent_slug_id_umroh_nama_key;
DROP INDEX IF EXISTS idx_jamaah_agent;
DROP INDEX IF EXISTS idx_jamaah_hijriah;
ALTER TABLE jamaah DROP CONSTRAINT jamaah_agent_slug_fkey;
ALTER TABLE jamaah DROP COLUMN agent_slug;
```

#### jamaah_haji

```sql
ALTER TABLE jamaah_haji ADD COLUMN agent_id UUID;
UPDATE jamaah_haji SET agent_id = agents.id FROM agents WHERE jamaah_haji.agent_slug = agents.slug;
ALTER TABLE jamaah_haji ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE jamaah_haji ADD CONSTRAINT jamaah_haji_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id);

ALTER TABLE jamaah_haji ADD CONSTRAINT jamaah_haji_agent_id_id_haji_id_jamaah_key UNIQUE (agent_id, id_haji, id_jamaah);
CREATE INDEX idx_jamaah_haji_agent_id ON jamaah_haji(agent_id);

ALTER TABLE jamaah_haji DROP CONSTRAINT jamaah_haji_agent_slug_id_haji_id_jamaah_key;
DROP INDEX IF EXISTS idx_jamaah_haji_agent;
ALTER TABLE jamaah_haji DROP COLUMN agent_slug;
```

#### flight_shares

```sql
ALTER TABLE flight_shares ADD COLUMN agent_id UUID;
UPDATE flight_shares SET agent_id = agents.id FROM agents WHERE flight_shares.agent_slug = agents.slug;
ALTER TABLE flight_shares ALTER COLUMN agent_id SET NOT NULL;
ALTER TABLE flight_shares ADD CONSTRAINT flight_shares_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;

ALTER TABLE flight_shares ADD CONSTRAINT flight_shares_agent_id_flight_number_flight_date_key UNIQUE (agent_id, flight_number, flight_date);
CREATE INDEX idx_flight_shares_agent_id ON flight_shares(agent_id);

ALTER TABLE flight_shares DROP CONSTRAINT flight_shares_agent_slug_flight_number_flight_date_key;
DROP INDEX IF EXISTS idx_flight_shares_agent;
ALTER TABLE flight_shares DROP CONSTRAINT flight_shares_agent_slug_fkey;
ALTER TABLE flight_shares DROP COLUMN agent_slug;
```

#### ai_credits

```sql
ALTER TABLE ai_credits ADD COLUMN agent_id UUID;
UPDATE ai_credits SET agent_id = agents.id FROM agents WHERE ai_credits.agent_slug = agents.slug;
ALTER TABLE ai_credits ALTER COLUMN agent_id SET NOT NULL;

-- Change PK from agent_slug to agent_id
ALTER TABLE ai_credits DROP CONSTRAINT ai_credits_pkey;
ALTER TABLE ai_credits ADD PRIMARY KEY (agent_id);
ALTER TABLE ai_credits ADD CONSTRAINT ai_credits_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id);

ALTER TABLE ai_credits DROP COLUMN agent_slug;
```

#### capi_configs

```sql
ALTER TABLE capi_configs ADD COLUMN agent_id UUID;
UPDATE capi_configs SET agent_id = agents.id FROM agents WHERE capi_configs.slug = agents.slug;
ALTER TABLE capi_configs ALTER COLUMN agent_id SET NOT NULL;

ALTER TABLE capi_configs DROP CONSTRAINT capi_configs_pkey;
ALTER TABLE capi_configs ADD PRIMARY KEY (agent_id);
ALTER TABLE capi_configs ADD CONSTRAINT capi_configs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id);

ALTER TABLE capi_configs DROP COLUMN slug;
```

#### analytics_events

```sql
ALTER TABLE analytics_events ADD COLUMN agent_id UUID;
UPDATE analytics_events SET agent_id = agents.id FROM agents WHERE analytics_events.agent_slug = agents.slug;
-- agent_id can be NULL for anonymous events, so no NOT NULL constraint
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES agents(id);

ALTER TABLE analytics_events DROP COLUMN agent_slug;
```

> **Note:** Constraint names in the SQL above are assumed defaults. Before running, verify actual constraint names with `SELECT conname FROM pg_constraint WHERE conrelid = 'tablename'::regclass;` in Supabase SQL editor.

### 4. Finalize `agents` PK swap

After all child FKs are migrated away from `slug`:

```sql
ALTER TABLE agents DROP CONSTRAINT agents_pkey;
ALTER TABLE agents ADD PRIMARY KEY (id);
ALTER TABLE agents ADD CONSTRAINT agents_slug_unique UNIQUE (slug);
ALTER TABLE agents ALTER COLUMN slug SET NOT NULL;
```

---

## JWT & Authentication Changes

### JWT payload

- **Before:** `{ slug, name, role }`
- **After:** `{ id, slug, name, role }`

`id` (UUID) becomes the primary identifier. `slug` is included for convenience (URL generation, display).

### Auth middleware

`req.user.id` replaces `req.user.slug` for all database queries. `req.user.slug` remains available for URL-related logic.

### Login flow

1. Client sends slug (or email) + password
2. Server queries `agents` by slug or email
3. Returns JWT with `{ id: agent.id, slug: agent.slug, name: agent.name, role: agent.role }`

### Token invalidation

Existing tokens will become invalid after deployment because the JWT payload structure changes. All agents will need to re-login. This is acceptable as a one-time event.

---

## Server Code Changes (server.js)

### Query pattern changes

All 60+ locations that use `req.user.slug` for database queries change to `req.user.id`:

| Before | After |
|--------|-------|
| `.eq('agent_slug', req.user.slug)` | `.eq('agent_id', req.user.id)` |
| `.eq('slug', req.user.slug)` on agents table | `.eq('id', req.user.id)` |
| `onConflict: 'agent_slug,id_umroh,nama'` | `onConflict: 'agent_id,id_umroh,nama'` |

### Agent cache

```javascript
// Before
const map = {};
for (const a of data) map[a.slug] = a;

// After
const idMap = {};
const slugMap = {};
for (const a of data) {
  idMap[a.id] = a;
  slugMap[a.slug] = a;
}
```

- `getAgent(id)` — used by authenticated routes (from JWT id)
- `getAgentBySlug(slug)` — used by public URL routes and login

### syncingAgents Map

Key changes from slug to id:

```javascript
// Before
syncingAgents.get(req.user.slug)
// After
syncingAgents.get(req.user.id)
```

### Slug change endpoint (PUT /api/admin/profile)

Simplified dramatically:

```javascript
// Before: delete all jamaah + re-insert (destructive)
// After:
// 1. Check new slug uniqueness
// 2. Insert old slug into agent_slug_history
// 3. Update agents.slug
// 4. Invalidate agent cache
// 5. Issue new JWT with updated slug
// No jamaah data touched — they reference agent_id, not slug
```

### Admin routes

Routes like `/api/admin/agents/:slug` and `/api/capi/:slug/*` still accept slug in URL params but resolve to id internally:

```javascript
const agent = getAgentBySlug(req.params.slug);
if (!agent) return res.status(404).json({ error: 'Agent not found' });
// Use agent.id for all subsequent queries
```

### logAnalyticsEvent

```javascript
// Before
async function logAnalyticsEvent(agentSlug, eventType, eventName, metadata) {
  await supabase.from('analytics_events').insert({ agent_slug: agentSlug, ... });
}

// After
async function logAnalyticsEvent(agentId, eventType, eventName, metadata) {
  await supabase.from('analytics_events').insert({ agent_id: agentId, ... });
}
```

---

## Frontend & URL Changes

### Public URL routing (unchanged pattern)

URLs remain `/:slug/umroh`, `/:slug/haji`. Slug is resolved to agent data via the agent map.

### Slug redirect logic

Added to route handlers for `/:slug/*`:

```javascript
// In route handler
const agent = getAgentBySlug(slug);
if (!agent) {
  // Check history for old slug redirect
  const { data } = await supabase
    .from('agent_slug_history')
    .select('agent_id')
    .eq('old_slug', slug)
    .order('changed_at', { ascending: false })
    .limit(1)
    .single();
  
  if (data) {
    const currentAgent = getAgent(data.agent_id);
    if (currentAgent) {
      return res.redirect(301, `/${currentAgent.slug}${req.path.slice(slug.length + 1)}`);
    }
  }
  return res.status(404).send('Agent not found');
}
```

### Frontend agent data loading

[src/data/agents.ts](src/data/agents.ts) — still loads agents keyed by slug for URL matching. No change needed.

### Login page

[src/components/LoginPage.tsx](src/components/LoginPage.tsx) — still sends slug to login. Server returns JWT with id + slug. Frontend stores token as before.

---

## Migration Scripts & Seed Data

### Affected scripts in /scripts/

| Script | Change |
|--------|--------|
| `migrate-agents-to-supabase.js` | Update upsert to include `id`, onConflict changes |
| `migrate-jamaah-table.js` | Schema uses `agent_id` instead of `agent_slug` |
| `migrate-haji-table.js` | Schema uses `agent_id` instead of `agent_slug` |
| `migrate-flight-shares.js` | Schema uses `agent_id` instead of `agent_slug` |
| `migrate-ai-credits.js` | PK changes to `agent_id` |
| `seed-bagas.js` | Use `agent_id` instead of `agent_slug` |
| `seed-demo.js` | Use `agent_id` instead of `agent_slug` |

### Hardcoded agent data

[src/data/agents.ts](src/data/agents.ts) has 24 hardcoded fallback agents keyed by slug. This remains valid — slug is still a unique field, just no longer PK.

---

## Verification Plan

1. **Run SQL migration** in Supabase dashboard — verify all tables have `agent_id` columns, old `agent_slug` columns are dropped, and FK constraints are correct
2. **Deploy updated server.js** — verify server starts without errors
3. **Test login flow** — login with existing agent, verify JWT contains `id` field
4. **Test sync** — trigger jamaah sync, verify data is inserted with `agent_id`
5. **Test slug change** — change an agent's slug via profile page, verify:
   - Old URL redirects to new slug (301)
   - All jamaah data still accessible under new slug
   - New JWT issued with updated slug
6. **Test admin panel** — list agents, edit agent, delete agent
7. **Test public landing pages** — visit `/:slug/umroh` and `/:slug/haji`
8. **Test CAPI routes** — `/api/capi/:slug/config` resolves correctly

---

## Key Files to Modify

| File | Impact |
|------|--------|
| `server.js` | Major — 60+ query changes, auth, cache, sync logic |
| `src/data/agents.ts` | Minor — no structural change needed |
| `src/components/LoginPage.tsx` | Minor — no change needed (sends slug, receives JWT) |
| `src/utils/authUtils.ts` | Minor — no change needed (stores token as-is) |
| `telegram-notifier.js` | Medium — update queries to use `agent_id` |
| `haji-api.js` | Medium — update upsert/delete queries |
| `scripts/seed-*.js` | Medium — update to use `agent_id` |
| `functions/[slug]/*.ts` | Minor — still resolve by slug, no change |
