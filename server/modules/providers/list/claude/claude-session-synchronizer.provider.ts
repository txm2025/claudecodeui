import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import { sessionsDb } from '@/modules/database/index.js';
import {
  buildLookupMap,
  findFilesRecursivelyCreatedAfter,
  normalizeSessionName,
  readFileTimestamps,
} from '@/shared/utils.js';
import type { IProviderSessionSynchronizer } from '@/shared/interfaces.js';

type ParsedSession = {
  sessionId: string;
  projectPath: string;
  sessionName?: string;
};

type SessionScan = {
  sessionId: string;
  projectPath: string;
  firstUserMessage?: string;
};

/**
 * Session indexer for Claude transcript artifacts.
 */
export class ClaudeSessionSynchronizer implements IProviderSessionSynchronizer {
  private readonly provider = 'claude' as const;
  private readonly claudeHome = path.join(os.homedir(), '.claude');

  /**
   * Scans ~/.claude/projects and upserts discovered sessions into DB.
   */
  async synchronize(since?: Date): Promise<number> {
    const nameMap = await buildLookupMap(path.join(this.claudeHome, 'history.jsonl'), 'sessionId', 'display');
    const files = await findFilesRecursivelyCreatedAfter(
      path.join(this.claudeHome, 'projects'),
      '.jsonl',
      since ?? null
    );

    let processed = 0;
    for (const filePath of files) {
      const parsed = await this.processSessionFile(filePath, nameMap);
      if (!parsed) {
        continue;
      }

      const timestamps = await readFileTimestamps(filePath);
      sessionsDb.createSession(
        parsed.sessionId,
        this.provider,
        parsed.projectPath,
        parsed.sessionName,
        timestamps.createdAt,
        timestamps.updatedAt,
        filePath
      );
      processed += 1;
    }

    return processed;
  }

  /**
   * Parses and upserts one Claude session JSONL file.
   */
  async synchronizeFile(filePath: string): Promise<string | null> {
    if (!filePath.endsWith('.jsonl')) {
      return null;
    }

    const nameMap = await buildLookupMap(path.join(this.claudeHome, 'history.jsonl'), 'sessionId', 'display');
    const parsed = await this.processSessionFile(filePath, nameMap);
    if (!parsed) {
      return null;
    }

    const timestamps = await readFileTimestamps(filePath);
    return sessionsDb.createSession(
      parsed.sessionId,
      this.provider,
      parsed.projectPath,
      parsed.sessionName,
      timestamps.createdAt,
      timestamps.updatedAt,
      filePath
    );
  }

  /**
   * Extracts session metadata from one Claude JSONL session file.
   * Falls back to the first real user message as the session name when
   * `~/.claude/history.jsonl` has no recorded display for this session
   * (e.g., sessions started via cloudcli's PTY rather than the direct CLI).
   */
  private async processSessionFile(
    filePath: string,
    nameMap: Map<string, string>
  ): Promise<ParsedSession | null> {
    const scan = await this.scanSessionFile(filePath);
    if (!scan) {
      return null;
    }

    const fromHistory = nameMap.get(scan.sessionId);
    const fallback = scan.firstUserMessage || 'Untitled Claude Session';

    return {
      sessionId: scan.sessionId,
      projectPath: scan.projectPath,
      sessionName: normalizeSessionName(fromHistory, fallback),
    };
  }

  /**
   * Single line-by-line pass over a session JSONL to capture both the
   * session metadata (sessionId + cwd) and the first authentic user prompt.
   * Stops as soon as both are known to keep cold-sync cheap.
   */
  private async scanSessionFile(filePath: string): Promise<SessionScan | null> {
    let sessionId: string | undefined;
    let projectPath: string | undefined;
    let firstUserMessage: string | undefined;

    try {
      const fileStream = fs.createReadStream(filePath);
      const lineReader = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      for await (const line of lineReader) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let data: Record<string, unknown>;
        try {
          data = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          continue;
        }

        if (!sessionId && typeof data.sessionId === 'string') {
          sessionId = data.sessionId;
        }
        if (!projectPath && typeof data.cwd === 'string') {
          projectPath = data.cwd;
        }

        if (!firstUserMessage && data.type === 'user') {
          const text = extractUserMessageText(data);
          if (text) {
            firstUserMessage = text;
          }
        }

        if (sessionId && projectPath && firstUserMessage) {
          break;
        }
      }

      lineReader.close();
      fileStream.close();
    } catch {
      // Swallow parse/read errors so a broken transcript doesn't stall a full sync.
    }

    if (!sessionId || !projectPath) {
      return null;
    }

    return { sessionId, projectPath, firstUserMessage };
  }
}

function extractUserMessageText(data: Record<string, unknown>): string | undefined {
  const message = data.message as Record<string, unknown> | undefined;
  if (!message) return undefined;

  const content = message.content;
  let text: string | undefined;

  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === 'object') {
        const partObj = part as Record<string, unknown>;
        // Skip tool_result / tool_use blocks; only take the first text block.
        if (partObj.type === 'text' && typeof partObj.text === 'string') {
          text = partObj.text;
          break;
        }
      }
    }
  }

  if (!text) return undefined;

  const cleaned = text.trim();
  if (!cleaned) return undefined;

  // Skip system reminders, tool results, and other non-user-authored content
  // that is delivered through the user channel.
  if (cleaned.startsWith('<') || cleaned.startsWith('[Request interrupted')) {
    return undefined;
  }

  // Skip pure command-style content like /commands or shell snippets that
  // don't make for a meaningful title.
  return cleaned;
}
