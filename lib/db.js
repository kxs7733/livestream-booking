'use strict';
const { createClient } = require('@supabase/supabase-js');

let _supabase = null;
const getSupabase = () => {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return _supabase;
};
const supabase = new Proxy({}, { get: (_, prop) => getSupabase()[prop] });

// ─── camelCase ↔ snake_case conversion ────────────────────────────────────────

const camelToSnake = s => s.replace(/([A-Z])/g, c => '_' + c.toLowerCase());
const snakeToCamel = s => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

const toSnake = obj => {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [camelToSnake(k), v]));
};

const toCamel = obj => {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [snakeToCamel(k), v]));
};

const rowsToCamel = rows => (rows || []).map(toCamel);

// Fetch all rows in parallel pages (get count, then all pages simultaneously)
const PAGE = 1000;
async function fetchAllParallel(table, applyFilters) {
  const { count, error: countErr } = await applyFilters(supabase.from(table).select('*', { count: 'exact', head: true }));
  if (countErr) throw new Error(`[db ${table}] ${countErr.message}`);
  if (!count) return [];
  const numPages = Math.ceil(count / PAGE);
  const results = await Promise.all(
    Array.from({ length: numPages }, (_, i) =>
      applyFilters(supabase.from(table).select('*').range(i * PAGE, (i + 1) * PAGE - 1))
    )
  );
  const rows = [];
  for (const { data, error } of results) {
    if (error) throw new Error(`[db ${table}] ${error.message}`);
    rows.push(...(data || []));
  }
  return rows;
}

// ─── DB helpers ────────────────────────────────────────────────────────────────

const db = {
  // Select all rows from a table
  async all(table) {
    const rows = await fetchAllParallel(table, q => q);
    return rowsToCamel(rows);
  },

  // Select rows matching a filter object
  async where(table, filters) {
    const rows = await fetchAllParallel(table, q => {
      for (const [k, v] of Object.entries(toSnake(filters))) q = q.eq(k, v);
      return q;
    });
    return rowsToCamel(rows);
  },

  // Find a single row by id
  async findById(table, id) {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`[db.findById ${table}] ${error.message}`);
    return toCamel(data);
  },

  // Insert one row (data in camelCase)
  async insert(table, data) {
    const { error } = await supabase.from(table).insert(toSnake(data));
    if (error) throw new Error(`[db.insert ${table}] ${error.message}`);
    return true;
  },

  // Insert multiple rows
  async insertMany(table, rows) {
    if (!rows.length) return true;
    const { error } = await supabase.from(table).insert(rows.map(toSnake));
    if (error) throw new Error(`[db.insertMany ${table}] ${error.message}`);
    return true;
  },

  // Update row by id (updates in camelCase)
  async updateById(table, id, updates) {
    const { error } = await supabase.from(table).update(toSnake(updates)).eq('id', id);
    if (error) throw new Error(`[db.updateById ${table}] ${error.message}`);
    return true;
  },

  // Update rows matching a column value
  async updateWhere(table, col, val, updates) {
    const { error } = await supabase.from(table).update(toSnake(updates)).eq(camelToSnake(col), val);
    if (error) throw new Error(`[db.updateWhere ${table}] ${error.message}`);
    return true;
  },

  // Delete by id
  async deleteById(table, id) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw new Error(`[db.deleteById ${table}] ${error.message}`);
    return true;
  },

  // Upsert (for telegram_users)
  async upsert(table, data, onConflict) {
    const { error } = await supabase.from(table).upsert(toSnake(data), { onConflict });
    if (error) throw new Error(`[db.upsert ${table}] ${error.message}`);
    return true;
  },

  // Get / set properties (replaces PropertiesService)
  async getProp(key) {
    const { data } = await supabase.from('properties').select('value').eq('key', key).maybeSingle();
    return data ? data.value : null;
  },

  async setProp(key, value) {
    const { error } = await supabase.from('properties').upsert({ key, value }, { onConflict: 'key' });
    if (error) throw new Error(`[db.setProp] ${error.message}`);
  },

  // Raw supabase client for advanced queries
  client: supabase,
};

module.exports = { db, supabase, toCamel, toSnake, rowsToCamel, camelToSnake, snakeToCamel };
