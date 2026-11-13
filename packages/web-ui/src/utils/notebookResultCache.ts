import type {QueryResult} from '@/types/editor';
import type {NotebookCell} from '@/types/notebook';

/** Larger results are not cached: they would make every save slow. */
export const MAX_CACHED_ROWS = 50_000;
/** Whole cache file stays under the web server's 1 MiB request body limit. */
export const MAX_CACHED_BYTES = 900_000;

const VERSION = 1;

interface CacheEntry {
    content: string;
    result: QueryResult;
    executionTime: number | null;
    timestamp: number;
}

/**
 * Cell ids are regenerated on every load, so entries are matched by SQL text:
 * an edited query no longer gets the result of the old one.
 */
export function serializeResults(cells: NotebookCell[], now: number): string {
    const encoder = new TextEncoder();
    // Envelope `{"version":1,"entries":[]}` plus a comma per entry.
    let bytes = 30;
    const entries: string[] = [];
    for (const c of cells) {
        // Key by the SQL that produced the result: an edited, unrun query must not inherit it.
        if (c.type !== 'sql' || !c.result || c.resultQuery == null) continue;
        if (c.result.rows.length > MAX_CACHED_ROWS) continue;
        const entry: CacheEntry = {
            content: c.resultQuery,
            result: c.result,
            executionTime: c.executionTime ?? null,
            timestamp: c.cachedAt ?? now,
        };
        const json = JSON.stringify(entry);
        const size = encoder.encode(json).length + 1;
        // Skip only the cell that does not fit, so one wide result never drops the rest.
        if (bytes + size > MAX_CACHED_BYTES) continue;
        bytes += size;
        entries.push(json);
    }
    return `{"version":${VERSION},"entries":[${entries.join(',')}]}`;
}

function parseEntries(raw: string | null): CacheEntry[] | null {
    if (!raw) return null;
    try {
        const data = JSON.parse(raw) as {version?: unknown; entries?: unknown};
        if (data.version !== VERSION || !Array.isArray(data.entries)) return null;
        return data.entries.filter(
            (e): e is CacheEntry =>
                typeof e === 'object' &&
                e !== null &&
                typeof e.content === 'string' &&
                typeof e.timestamp === 'number' &&
                Array.isArray(e.result?.columns) &&
                Array.isArray(e.result?.rows),
        );
    } catch {
        return null;
    }
}

/** Fill SQL cells that have no result from the cache file; returns `cells` unchanged when nothing applies. */
export function applyCachedResults(cells: NotebookCell[], raw: string | null): NotebookCell[] {
    const entries = parseEntries(raw);
    if (!entries || entries.length === 0) return cells;
    const unused = [...entries];
    return cells.map((cell) => {
        if (cell.type !== 'sql' || cell.result) return cell;
        const index = unused.findIndex((e) => e.content === cell.content);
        if (index === -1) return cell;
        const [entry] = unused.splice(index, 1);
        return {
            ...cell,
            result: entry.result,
            executionTime: entry.executionTime,
            cachedAt: entry.timestamp,
            resultQuery: entry.content,
        };
    });
}
