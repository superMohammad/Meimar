import * as duckdb from "@duckdb/duckdb-wasm";

/**
 * The browser's connection to the Parquet files in `public/data`.
 *
 * A class here rather than free functions because this is a connector to an
 * external system holding real handles -- a worker, a WASM instance, a
 * connection -- and those need an owner.
 *
 * The single-threaded exception-handling build is used deliberately. The
 * multi-threaded build requires cross-origin isolation (COOP/COEP headers),
 * which would have to be configured for every deployment target, and at 14 MB
 * of map data it buys nothing measurable.
 *
 * Files are registered as HTTP handles, not downloaded. DuckDB issues range
 * requests for the row groups a query actually touches; the Next.js static
 * handler answers them with 206 Partial Content. That is what keeps a
 * 155 MB details file usable from a browser.
 */

const WASM_URL = "/duckdb/duckdb-eh.wasm";
const WORKER_URL = "/duckdb/duckdb-browser-eh.worker.js";

export const DATA_FILES = {
  map: "/data/map.parquet",
  details: "/data/details.parquet",
  districts: "/data/districts.parquet",
  district_prices: "/data/district_prices.parquet",
} as const;

export type DataTable = keyof typeof DATA_FILES;

/**
 * The only view the map needs to draw anything.
 *
 * Creating a view over a remote Parquet is not free: DuckDB range-reads the
 * file's footer to learn its schema. Boot used to create all four in sequence,
 * so first paint waited on four round trips -- one of them into a 134 MB file
 * that is not read until somebody clicks a pin. The rest are created on first
 * use instead.
 */
const BOOT_TABLE: DataTable = "map";

class DuckDbClient {
  private database: duckdb.AsyncDuckDB | null = null;
  private connection: duckdb.AsyncDuckDBConnection | null = null;
  private booting: Promise<duckdb.AsyncDuckDBConnection> | null = null;
  /** In-flight or settled view creation, one per table. */
  private views = new Map<DataTable, Promise<void>>();

  /** Boot once; concurrent callers share the same in-flight boot. */
  private async connect(): Promise<duckdb.AsyncDuckDBConnection> {
    if (this.connection) return this.connection;
    if (this.booting) return this.booting;

    this.booting = this.boot();
    try {
      this.connection = await this.booting;
      return this.connection;
    } finally {
      this.booting = null;
    }
  }

  private async boot(): Promise<duckdb.AsyncDuckDBConnection> {
    const worker = new Worker(WORKER_URL);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    const database = new duckdb.AsyncDuckDB(logger, worker);

    await database.instantiate(WASM_URL);

    const connection = await database.connect();

    // Registering a handle is bookkeeping, not I/O -- no byte of any file is
    // read here -- so this is cheap. Kept sequential: these are messages to a
    // worker whose protocol is not worth assuming is re-entrant for the sake
    // of saving microseconds on calls that touch no network.
    const origin = window.location.origin;
    for (const [name, path] of Object.entries(DATA_FILES)) {
      await database.registerFileURL(
        `${name}.parquet`,
        `${origin}${path}`,
        duckdb.DuckDBDataProtocol.HTTP,
        false,
      );
    }

    this.database = database;

    // Only the table first paint needs. The others follow on demand.
    //
    // `this.connection` is deliberately NOT set before this line: `connect()`
    // returns early to anyone who finds it set, and a caller handed a
    // connection whose `map` view does not exist yet would query a table that
    // is not there.
    await this.ensureView(connection, BOOT_TABLE);
    return connection;
  }

  private async createView(
    connection: duckdb.AsyncDuckDBConnection,
    table: DataTable,
  ): Promise<void> {
    // A view, not a table: this reads the Parquet footer for a schema and
    // nothing else. Each later query range-fetches only the row groups and
    // column chunks it actually touches.
    await connection.query(
      `CREATE OR REPLACE VIEW ${table} AS SELECT * FROM read_parquet('${table}.parquet')`,
    );
  }

  /**
   * Make sure a table is queryable, creating its view once.
   *
   * The promise is cached rather than a boolean, so two callers racing for the
   * same table share one `CREATE VIEW` instead of issuing two.
   */
  private ensureView(
    connection: duckdb.AsyncDuckDBConnection,
    table: DataTable,
  ): Promise<void> {
    const existing = this.views.get(table);
    if (existing !== undefined) return existing;

    const created = this.createView(connection, table).catch((cause: unknown) => {
      // A failed creation must not be remembered as done, or every later query
      // against this table fails with a confusing "table not found".
      this.views.delete(table);
      throw cause;
    });
    this.views.set(table, created);
    return created;
  }

  /**
   * Run a read-only query and return its rows as plain objects.
   *
   * `tables` names every view the SQL reads, so their schemas can be resolved
   * before the query runs. It is required rather than inferred: parsing table
   * names out of SQL would be a guess, and a wrong guess surfaces as a runtime
   * "table not found" instead of a compile error.
   *
   * Arrow's `toArray()` yields row proxies whose numeric columns can be
   * BigInt; `normaliseRow` converts those to Number. Every id, price and count
   * in this dataset is far below 2^53, so the conversion is lossless. Any
   * future column that is not -- an identifier wider than 53 bits -- must be
   * stored as a string, because this conversion would corrupt it silently.
   */
  async query<TRow>(sql: string, tables: readonly DataTable[]): Promise<TRow[]> {
    const connection = await this.connect();
    await Promise.all(tables.map((table) => this.ensureView(connection, table)));
    const result = await connection.query(sql);
    return result.toArray().map((row) => normaliseRow(row.toJSON()) as TRow);
  }

  async close(): Promise<void> {
    await this.connection?.close();
    await this.database?.terminate();
    this.connection = null;
    this.database = null;
    this.views.clear();
  }
}

function normaliseRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalised: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalised[key] = typeof value === "bigint" ? Number(value) : value;
  }
  return normalised;
}

export const duckDbClient = new DuckDbClient();
