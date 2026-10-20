CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120 AND name = trim(name)),
 sku TEXT NOT NULL CHECK(length(trim(sku)) BETWEEN 1 AND 64 AND sku = trim(sku) AND sku = upper(sku)),
 category TEXT NOT NULL CHECK(length(trim(category)) BETWEEN 1 AND 80 AND category = trim(category)),
 stock INTEGER NOT NULL CHECK(typeof(stock) = 'integer' AND stock >= 0 AND stock <= 9007199254740991),
 version INTEGER NOT NULL DEFAULT 1 CHECK(typeof(version) = 'integer' AND version > 0),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON products(sku);
