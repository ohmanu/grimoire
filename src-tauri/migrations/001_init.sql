-- Grimoire: esquema inicial.
-- Los diccionarios (categorías, autores, series, sigils) guardan el nombre tal
-- como se escribió y una clave normalizada (sin mayúsculas ni acentos) única.

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL
) STRICT;

-- `revision` sube con cada cambio de datos; las copias de seguridad la usan
-- para no duplicar copias idénticas.
INSERT INTO meta (key, value) VALUES ('revision', 0);

CREATE TABLE categories (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  name_norm TEXT NOT NULL UNIQUE
) STRICT;

CREATE TABLE authors (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  name_norm TEXT NOT NULL UNIQUE
) STRICT;

CREATE TABLE series (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  name_norm TEXT NOT NULL UNIQUE
) STRICT;

CREATE TABLE sigils (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  name_norm TEXT NOT NULL UNIQUE
) STRICT;

CREATE TABLE books (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL CHECK (length(trim(title)) > 0),
  title_norm    TEXT NOT NULL,
  subtitle      TEXT,
  category_id   INTEGER REFERENCES categories (id) ON DELETE SET NULL,
  series_id     INTEGER REFERENCES series (id) ON DELETE SET NULL,
  series_number REAL CHECK (series_number IS NULL OR series_number > 0),
  publisher     TEXT,
  year          INTEGER CHECK (year IS NULL OR year BETWEEN -3000 AND 2100),
  isbn          TEXT,
  language      TEXT,
  pages         INTEGER CHECK (pages IS NULL OR pages > 0),
  format        TEXT NOT NULL DEFAULT 'fisico' CHECK (format IN ('fisico', 'ebook', 'audio')),
  status        TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'leyendo', 'leido')),
  rating        INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  location      TEXT,
  synopsis      TEXT,
  notes         TEXT,
  cover         TEXT,
  lent_to       TEXT,
  lent_at       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at    TEXT
) STRICT;

CREATE INDEX books_deleted_at ON books (deleted_at);
CREATE INDEX books_title_norm ON books (title_norm);
CREATE INDEX books_category ON books (category_id);
CREATE INDEX books_series ON books (series_id);

CREATE TABLE book_authors (
  book_id   INTEGER NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES authors (id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  PRIMARY KEY (book_id, author_id)
) STRICT;

CREATE INDEX book_authors_author ON book_authors (author_id);

CREATE TABLE book_sigils (
  book_id  INTEGER NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  sigil_id INTEGER NOT NULL REFERENCES sigils (id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, sigil_id)
) STRICT;

CREATE INDEX book_sigils_sigil ON book_sigils (sigil_id);

-- Índice de texto completo; rowid = books.id. Lo mantiene la aplicación.
CREATE VIRTUAL TABLE books_fts USING fts5 (
  title, subtitle, authors, series, synopsis,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Contador de revisión.
CREATE TRIGGER books_ai AFTER INSERT ON books BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER books_au AFTER UPDATE ON books BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER books_ad AFTER DELETE ON books BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER book_authors_ai AFTER INSERT ON book_authors BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER book_authors_ad AFTER DELETE ON book_authors BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER book_sigils_ai AFTER INSERT ON book_sigils BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER book_sigils_ad AFTER DELETE ON book_sigils BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER categories_ai AFTER INSERT ON categories BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER categories_au AFTER UPDATE ON categories BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER categories_ad AFTER DELETE ON categories BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER authors_ai AFTER INSERT ON authors BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER authors_au AFTER UPDATE ON authors BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER authors_ad AFTER DELETE ON authors BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER series_ai AFTER INSERT ON series BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER series_au AFTER UPDATE ON series BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER series_ad AFTER DELETE ON series BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER sigils_ai AFTER INSERT ON sigils BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER sigils_au AFTER UPDATE ON sigils BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
CREATE TRIGGER sigils_ad AFTER DELETE ON sigils BEGIN UPDATE meta SET value = value + 1 WHERE key = 'revision'; END;
