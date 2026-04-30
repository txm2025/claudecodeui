import { Check, Edit2, Trash2, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { TFunction } from 'i18next';

import { Button } from '../../../../shared/view/ui';
import { cn } from '../../../../lib/utils';
import type { Project, ProjectSession, LLMProvider } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';
import { createSessionViewModel } from '../../utils/utils';

function useSessionQueueCount(sessionId: string): number {
  const key = `messageQueue:${sessionId}`;
  const readCount = () => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch { return 0; }
  };
  const [count, setCount] = useState(readCount);

  useEffect(() => {
    setCount(readCount());
    // cross-tab sync
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setCount(readCount());
    };
    // same-tab sync via custom event from useChatComposerState
    const onQueueChange = (e: CustomEvent<{ key: string }>) => {
      if (e.detail?.key === key) setCount(readCount());
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('queuechange', onQueueChange as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('queuechange', onQueueChange as EventListener);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return count;
}

type SidebarSessionItemProps = {
  project: Project;
  session: SessionWithProvider;
  selectedSession: ProjectSession | null;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: LLMProvider) => void;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (
    projectName: string,
    sessionId: string,
    sessionTitle: string,
    provider: LLMProvider,
  ) => void;
  t: TFunction;
};

/**
 * Compact relative time for sidebar rows:
 * <1m, Xm, Xhr, Xd.
 */
const formatCompactSessionAge = (dateString: string, currentTime: Date): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diffInMinutes = Math.floor(Math.max(0, currentTime.getTime() - date.getTime()) / (1000 * 60));
  if (diffInMinutes < 1) {
    return '<1m';
  }

  if (diffInMinutes < 60) {
    return `${diffInMinutes}m`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}hr`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d`;
};

export default function SidebarSessionItem({
  project,
  session,
  selectedSession,
  currentTime,
  editingSession,
  editingSessionName,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  onProjectSelect,
  onSessionSelect,
  onDeleteSession,
  t,
}: SidebarSessionItemProps) {
  const sessionView = createSessionViewModel(session, currentTime, t);
  const isSelected = selectedSession?.id === session.id;
  const compactSessionAge = formatCompactSessionAge(sessionView.sessionTime, currentTime);
  const queueCount = useSessionQueueCount(session.id);

  // Sessions are owned by a project identified by `projectId` (DB primary key)
  // after the projectName → projectId migration.
  const selectMobileSession = () => {
    onProjectSelect(project);
    onSessionSelect(session, project.projectId);
  };

  const saveEditedSession = () => {
    onSaveEditingSession(project.projectId, session.id, editingSessionName, session.__provider);
  };

  const requestDeleteSession = () => {
    onDeleteSession(project.projectId, session.id, sessionView.sessionName, session.__provider);
  };

  return (
    <div className="group relative">
      {/* Mobile */}
      <div className="md:hidden">
        <div
          className={cn(
            'mx-2 my-px flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 active:bg-accent',
            isSelected ? 'bg-accent/70 text-foreground' : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
          )}
          onClick={selectMobileSession}
        >
          {sessionView.isActive && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />}
          <span className="min-w-0 flex-1 truncate text-xs">{sessionView.sessionName}</span>
          {queueCount > 0 && (
            <span className="flex-shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold leading-none text-primary-foreground">
              {queueCount}
            </span>
          )}
          {compactSessionAge && (
            <span className="flex-shrink-0 text-[10px] text-muted-foreground/60">{compactSessionAge}</span>
          )}
          {!sessionView.isCursorSession && (
            <button
              className="flex-shrink-0 opacity-50 hover:opacity-100"
              onClick={(event) => { event.stopPropagation(); requestDeleteSession(); }}
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </button>
          )}
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        {editingSession === session.id ? (
          <div className="flex items-center gap-1 px-2 py-1">
            <input
              type="text"
              value={editingSessionName}
              onChange={(event) => onEditingSessionNameChange(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') saveEditedSession();
                else if (event.key === 'Escape') onCancelEditingSession();
              }}
              onClick={(event) => event.stopPropagation()}
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <button
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); saveEditedSession(); }}
              title={t('tooltips.save')}
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onCancelEditingSession(); }}
              title={t('tooltips.cancel')}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <Button
            variant="ghost"
            className={cn(
              'relative w-full justify-start rounded-sm px-3 py-1.5 h-auto font-normal text-left transition-colors',
              isSelected
                ? 'bg-accent/60 text-foreground before:absolute before:left-0 before:top-0 before:h-full before:w-0.5 before:rounded-r before:bg-primary before:content-[\'\']'
                : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
            )}
            onClick={() => onSessionSelect(session, project.projectId)}
          >
            <div className="flex w-full min-w-0 items-center gap-2">
              {sessionView.isActive && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />}
              <span className="min-w-0 flex-1 truncate text-xs">{sessionView.sessionName}</span>
              {queueCount > 0 && (
                <span className="flex-shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold leading-none text-primary-foreground group-hover:opacity-0">
                  {queueCount}
                </span>
              )}
              {compactSessionAge && (
                <span className="ml-auto flex-shrink-0 text-[10px] text-muted-foreground/50 group-hover:opacity-0">
                  {compactSessionAge}
                </span>
              )}
            </div>
          </Button>
        )}

        {editingSession !== session.id && (
          <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:bg-accent hover:text-foreground"
              onClick={(event) => { event.stopPropagation(); onStartEditingSession(session.id, sessionView.sessionName); }}
              title={t('tooltips.editSessionName')}
            >
              <Edit2 className="h-2.5 w-2.5" />
            </button>
            {!sessionView.isCursorSession && (
              <button
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                onClick={(event) => { event.stopPropagation(); requestDeleteSession(); }}
                title={t('tooltips.deleteSession')}
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
