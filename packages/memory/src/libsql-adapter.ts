import { createClient, type Client } from '@libsql/client';
import {
  type IMemoryPort,
  type MemoryConfig,
  type EpisodicTrace,
  type SemanticFact,
  type ProceduralSkill,
  type HybridSearchResult,
  type SkillCapabilities,
} from './types.js';
import { cosineSimilarity, reciprocalRankFusion, type RankedItem } from './rrf.js';

export class LibSqlMemoryAdapter implements IMemoryPort {
  private client: Client;
  private config: MemoryConfig;
  private isInitialized = false;

  constructor(config: MemoryConfig) {
    this.config = config;
    this.client = createClient({
      url: config.url,
      authToken: config.authToken,
    });
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Episodic Traces Table
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS episodic_traces (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        input TEXT NOT NULL,
        output TEXT NOT NULL,
        retrieved_skill_ids TEXT NOT NULL,
        tool_calls TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        latency_ms REAL NOT NULL,
        success INTEGER NOT NULL,
        error_message TEXT,
        timestamp INTEGER NOT NULL
      );
    `);

    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_traces_session ON episodic_traces(session_id);
    `);
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON episodic_traces(timestamp DESC);
    `);

    // Procedural Skills Table
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS procedural_skills (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        capabilities TEXT NOT NULL,
        version TEXT NOT NULL,
        code TEXT NOT NULL,
        test_cases TEXT,
        hash TEXT NOT NULL,
        embedding TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // FTS5 Virtual Table for full-text search on skills
    try {
      await this.client.execute(`
        CREATE VIRTUAL TABLE IF NOT EXISTS fts_skills USING fts5(
          id UNINDEXED,
          name,
          description,
          tokenize = 'unicode61'
        );
      `);
    } catch {
      // In minimal edge environments where FTS5 extension is not compiled,
      // fallback to LIKE query will be performed automatically.
    }

    // Semantic Facts Table (Long-Term Knowledge & User Preferences)
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS semantic_facts (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        confidence REAL NOT NULL,
        embedding TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_facts_category ON semantic_facts(category);
    `);
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_facts_key ON semantic_facts(key);
    `);
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_facts_session ON semantic_facts(session_id);
    `);

    try {
      await this.client.execute(`
        CREATE VIRTUAL TABLE IF NOT EXISTS fts_facts USING fts5(
          id UNINDEXED,
          category,
          key,
          value,
          tokenize = 'unicode61'
        );
      `);
    } catch {
      // Fallback to LIKE query if FTS5 is not available
    }

    this.isInitialized = true;
  }

  public async close(): Promise<void> {
    this.client.close();
  }

  // --- Episodic Store Methods ---

  public async saveTrace(trace: EpisodicTrace): Promise<void> {
    await this.initialize();
    await this.client.execute({
      sql: `
        INSERT OR REPLACE INTO episodic_traces (
          id, session_id, input, output, retrieved_skill_ids, tool_calls,
          prompt_tokens, completion_tokens, total_tokens, latency_ms,
          success, error_message, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      args: [
        trace.id,
        trace.sessionId,
        trace.input,
        trace.output,
        JSON.stringify(trace.retrievedSkillIds),
        JSON.stringify(trace.toolCalls),
        trace.tokensUsed.promptTokens,
        trace.tokensUsed.completionTokens,
        trace.tokensUsed.totalTokens,
        trace.latencyMs,
        trace.success ? 1 : 0,
        trace.errorMessage || null,
        trace.timestamp,
      ],
    });
  }

  public async getTracesBySession(sessionId: string, limit = 50): Promise<EpisodicTrace[]> {
    await this.initialize();
    const result = await this.client.execute({
      sql: `
        SELECT * FROM episodic_traces
        WHERE session_id = ?
        ORDER BY timestamp ASC
        LIMIT ?;
      `,
      args: [sessionId, limit],
    });

    return result.rows.map((r) => this.mapRowToTrace(r));
  }

  public async getRecentTraces(limit = 100): Promise<EpisodicTrace[]> {
    await this.initialize();
    const result = await this.client.execute({
      sql: `
        SELECT * FROM episodic_traces
        ORDER BY timestamp DESC
        LIMIT ?;
      `,
      args: [limit],
    });

    return result.rows.map((r) => this.mapRowToTrace(r));
  }

  public async getFailedTraces(limit = 50): Promise<EpisodicTrace[]> {
    await this.initialize();
    const result = await this.client.execute({
      sql: `
        SELECT * FROM episodic_traces
        WHERE success = 0
        ORDER BY timestamp DESC
        LIMIT ?;
      `,
      args: [limit],
    });

    return result.rows.map((r) => this.mapRowToTrace(r));
  }

  // --- Semantic Fact Store Methods ---

  public async saveFact(fact: SemanticFact): Promise<void> {
    await this.initialize();
    await this.client.execute({
      sql: `
        INSERT INTO semantic_facts (
          id, session_id, category, key, value, confidence, embedding, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          value = excluded.value,
          confidence = excluded.confidence,
          embedding = excluded.embedding,
          updated_at = excluded.updated_at;
      `,
      args: [
        fact.id,
        fact.sessionId ?? null,
        fact.category,
        fact.key,
        fact.value,
        fact.confidence,
        fact.embedding ? JSON.stringify(fact.embedding) : null,
        fact.createdAt,
        fact.updatedAt,
      ],
    });

    try {
      await this.client.execute({
        sql: `DELETE FROM fts_facts WHERE id = ?;`,
        args: [fact.id],
      });
      await this.client.execute({
        sql: `INSERT INTO fts_facts (id, category, key, value) VALUES (?, ?, ?, ?);`,
        args: [fact.id, fact.category, fact.key, fact.value],
      });
    } catch {
      // Ignore if FTS5 not available
    }
  }

  public async getFact(key: string, category?: string): Promise<SemanticFact | null> {
    await this.initialize();
    const sql = category
      ? `SELECT * FROM semantic_facts WHERE key = ? AND category = ? LIMIT 1;`
      : `SELECT * FROM semantic_facts WHERE key = ? LIMIT 1;`;
    const args = category ? [key, category] : [key];

    const result = await this.client.execute({ sql, args });
    if (result.rows.length === 0) return null;
    return this.mapRowToFact(result.rows[0]);
  }

  public async listFacts(options?: {
    category?: string;
    sessionId?: string;
    limit?: number;
  }): Promise<SemanticFact[]> {
    await this.initialize();
    const conditions: string[] = [];
    const args: (string | number)[] = [];

    if (options?.category) {
      conditions.push('category = ?');
      args.push(options.category);
    }
    if (options?.sessionId) {
      conditions.push('session_id = ?');
      args.push(options.sessionId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit ?? 100;
    args.push(limit);

    const result = await this.client.execute({
      sql: `SELECT * FROM semantic_facts ${whereClause} ORDER BY updated_at DESC LIMIT ?;`,
      args,
    });

    return result.rows.map((r) => this.mapRowToFact(r));
  }

  public async searchFacts(
    query: string,
    options?: { category?: string; topK?: number }
  ): Promise<SemanticFact[]> {
    await this.initialize();
    const topK = options?.topK ?? 5;

    try {
      const cleanQuery = query
        .replace(/["*+\-^~()]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 1)
        .join(' OR ');

      if (cleanQuery.length > 0) {
        const catFilter = options?.category ? 'AND f.category = ?' : '';
        const args = options?.category ? [cleanQuery, options.category, topK] : [cleanQuery, topK];

        const ftsResult = await this.client.execute({
          sql: `
            SELECT s.* FROM fts_facts f
            JOIN semantic_facts s ON f.id = s.id
            WHERE fts_facts MATCH ? ${catFilter}
            ORDER BY bm25(fts_facts) ASC
            LIMIT ?;
          `,
          args,
        });

        if (ftsResult.rows.length > 0) {
          return ftsResult.rows.map((r) => this.mapRowToFact(r));
        }
      }
    } catch {
      // Fallback to LIKE
    }

    const catClause = options?.category ? 'AND category = ?' : '';
    const args = options?.category
      ? [`%${query}%`, `%${query}%`, options.category, topK]
      : [`%${query}%`, `%${query}%`, topK];

    const fallbackResult = await this.client.execute({
      sql: `
        SELECT * FROM semantic_facts
        WHERE (key LIKE ? OR value LIKE ?) ${catClause}
        ORDER BY updated_at DESC
        LIMIT ?;
      `,
      args,
    });

    return fallbackResult.rows.map((r) => this.mapRowToFact(r));
  }

  public async deleteFact(id: string): Promise<boolean> {
    await this.initialize();
    const result = await this.client.execute({
      sql: `DELETE FROM semantic_facts WHERE id = ?;`,
      args: [id],
    });

    try {
      await this.client.execute({
        sql: `DELETE FROM fts_facts WHERE id = ?;`,
        args: [id],
      });
    } catch {
      // Ignore
    }

    return (result.rowsAffected ?? 0) > 0;
  }

  // --- Procedural Store Methods ---

  public async saveSkill(skill: ProceduralSkill): Promise<void> {
    await this.initialize();
    const embeddingStr = skill.embedding ? JSON.stringify(skill.embedding) : null;
    const capabilitiesStr = JSON.stringify(skill.capabilities);

    await this.client.execute({
      sql: `
        INSERT OR REPLACE INTO procedural_skills (
          id, name, description, capabilities, version, code, test_cases, hash, embedding, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      args: [
        skill.id,
        skill.name,
        skill.description,
        capabilitiesStr,
        skill.version,
        skill.code,
        skill.testCases || null,
        skill.hash,
        embeddingStr,
        skill.createdAt,
        skill.updatedAt,
      ],
    });

    // Update FTS Index
    try {
      await this.client.execute({
        sql: `DELETE FROM fts_skills WHERE id = ?;`,
        args: [skill.id],
      });
      await this.client.execute({
        sql: `INSERT INTO fts_skills (id, name, description) VALUES (?, ?, ?);`,
        args: [skill.id, skill.name, skill.description],
      });
    } catch {
      // Ignore if FTS5 is not available
    }
  }

  public async getSkill(idOrName: string): Promise<ProceduralSkill | null> {
    await this.initialize();
    const result = await this.client.execute({
      sql: `SELECT * FROM procedural_skills WHERE id = ? OR name = ? LIMIT 1;`,
      args: [idOrName, idOrName],
    });

    if (result.rows.length === 0) return null;
    return this.mapRowToSkill(result.rows[0]);
  }

  public async listSkills(): Promise<ProceduralSkill[]> {
    await this.initialize();
    const result = await this.client.execute(`
      SELECT * FROM procedural_skills ORDER BY name ASC;
    `);
    return result.rows.map((r) => this.mapRowToSkill(r));
  }

  public async deleteSkill(id: string): Promise<boolean> {
    await this.initialize();
    const result = await this.client.execute({
      sql: `DELETE FROM procedural_skills WHERE id = ?;`,
      args: [id],
    });

    try {
      await this.client.execute({
        sql: `DELETE FROM fts_skills WHERE id = ?;`,
        args: [id],
      });
    } catch {
      // Ignore
    }

    return (result.rowsAffected ?? 0) > 0;
  }

  /**
   * Hybrid Search: Combines FTS5 BM25 search with Vector Cosine Similarity
   * using Reciprocal Rank Fusion (RRF).
   */
  public async searchSkillsHybrid(
    query: string,
    queryEmbedding?: number[],
    topK = 5
  ): Promise<HybridSearchResult<ProceduralSkill>[]> {
    await this.initialize();

    // 1. FTS5 Search
    const ftsRankings: RankedItem<ProceduralSkill>[] = [];
    try {
      // Sanitize query for FTS5 (strip special punctuation)
      const cleanFtsQuery = query
        .replace(/["*+\-^~()]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 1)
        .join(' OR ');

      if (cleanFtsQuery.length > 0) {
        const ftsResult = await this.client.execute({
          sql: `
            SELECT s.* FROM fts_skills f
            JOIN procedural_skills s ON f.id = s.id
            WHERE fts_skills MATCH ?
            ORDER BY bm25(fts_skills) ASC
            LIMIT 20;
          `,
          args: [cleanFtsQuery],
        });

        for (const row of ftsResult.rows) {
          const skill = this.mapRowToSkill(row);
          ftsRankings.push({ id: skill.id, item: skill });
        }
      }
    } catch {
      // Fallback to LIKE keyword search if FTS5 table is unavailable
      const fallbackResult = await this.client.execute({
        sql: `
          SELECT * FROM procedural_skills
          WHERE name LIKE ? OR description LIKE ?
          LIMIT 20;
        `,
        args: [`%${query}%`, `%${query}%`],
      });
      for (const row of fallbackResult.rows) {
        const skill = this.mapRowToSkill(row);
        ftsRankings.push({ id: skill.id, item: skill });
      }
    }

    // 2. Vector Cosine Similarity Search
    const vectorRankings: RankedItem<ProceduralSkill>[] = [];
    if (queryEmbedding && queryEmbedding.length > 0) {
      const allSkills = await this.listSkills();
      const scoredVector: { skill: ProceduralSkill; score: number }[] = [];

      for (const skill of allSkills) {
        if (skill.embedding && skill.embedding.length > 0) {
          const sim = cosineSimilarity(queryEmbedding, skill.embedding);
          scoredVector.push({ skill, score: sim });
        }
      }

      scoredVector.sort((a, b) => b.score - a.score);
      for (const entry of scoredVector.slice(0, 20)) {
        vectorRankings.push({ id: entry.skill.id, item: entry.skill });
      }
    }

    // 3. Reciprocal Rank Fusion (RRF)
    const fused = reciprocalRankFusion(ftsRankings, vectorRankings, this.config.rrfK || 60);

    return fused.slice(0, topK).map((res) => ({
      item: res.item,
      score: res.rrfScore,
      ftsRank: res.ftsRank,
      vectorRank: res.vectorRank,
      rrfScore: res.rrfScore,
    }));
  }

  // --- Row Mappers ---

  private mapRowToTrace(row: Record<string, unknown>): EpisodicTrace {
    return {
      id: String(row.id),
      sessionId: String(row.session_id),
      input: String(row.input),
      output: String(row.output),
      retrievedSkillIds: JSON.parse(String(row.retrieved_skill_ids || '[]')),
      toolCalls: JSON.parse(String(row.tool_calls || '[]')),
      tokensUsed: {
        promptTokens: Number(row.prompt_tokens || 0),
        completionTokens: Number(row.completion_tokens || 0),
        totalTokens: Number(row.total_tokens || 0),
      },
      latencyMs: Number(row.latency_ms || 0),
      success: Number(row.success) === 1,
      errorMessage: row.error_message ? String(row.error_message) : undefined,
      timestamp: Number(row.timestamp),
    };
  }

  private mapRowToSkill(row: Record<string, unknown>): ProceduralSkill {
    const rawCaps = row.capabilities ? JSON.parse(String(row.capabilities)) : {};
    return {
      id: String(row.id),
      name: String(row.name),
      description: String(row.description),
      capabilities: rawCaps as SkillCapabilities,
      version: String(row.version),
      code: String(row.code),
      testCases: row.test_cases ? String(row.test_cases) : undefined,
      hash: String(row.hash),
      embedding: row.embedding ? JSON.parse(String(row.embedding)) : undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  private mapRowToFact(row: Record<string, unknown>): SemanticFact {
    return {
      id: String(row.id),
      sessionId: row.session_id ? String(row.session_id) : undefined,
      category: String(row.category),
      key: String(row.key),
      value: String(row.value),
      confidence: Number(row.confidence ?? 1.0),
      embedding: row.embedding ? JSON.parse(String(row.embedding)) : undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }
}
